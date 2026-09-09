#!/usr/bin/env python3
"""
Основной цикл worker (worker loop) - через HTTP API
"""
import time
import signal
import logging
import socket
import os

from .http_client import WorkerHTTPClient
from .execute import execute_run
from . import logging_setup

logger = logging.getLogger(__name__)

# Глобальная переменная для graceful shutdown
shutdown_requested = False


def signal_handler(signum, frame):
    """Обработчик сигналов для graceful shutdown"""
    global shutdown_requested
    logger.info(f"Received signal {signum}, shutting down gracefully...")
    shutdown_requested = True


def _wait_for_worker_token(http_client: WorkerHTTPClient, timeout: float = 60.0) -> None:
    if http_client.worker_token:
        return
    deadline = time.time() + timeout
    while time.time() < deadline:
        if http_client.reload_token_from_disk():
            return
        logger.info(
            "Waiting for worker token at %s (Settings → Workers, or WORKER_TOKEN / WORKER_TOKEN_FILE)",
            http_client.token_file,
        )
        time.sleep(1)
    logger.error(
        "No worker token. Create a worker in Settings and set WORKER_TOKEN or WORKER_TOKEN_FILE (%s).",
        http_client.token_file,
    )
    raise SystemExit(1)


def worker_loop(server_url: str, poll_interval: int = 3, project_id: str = None,
                worker_name: str = None, capabilities: dict = None, max_concurrency: int = 1,
                tags: list = None):
    """
    Основной цикл воркера через HTTP API
    
    Args:
        server_url: URL сервера (например, http://localhost:8000)
        poll_interval: Интервал проверки очереди в секундах (по умолчанию 3, минимум рекомендуется 2)
        project_id: ID проекта для обработки (если None - обрабатывает все проекты)
        worker_name: Имя worker (если None - используется hostname)
        capabilities: Словарь capabilities worker
        max_concurrency: Максимальное количество параллельных runs
        tags: Tags worker для фильтрации по requirements
    """
    global shutdown_requested
    
    # Определяем имя worker
    if not worker_name:
        worker_name = socket.gethostname()
    
    logger.info(f"Worker starting (name: {worker_name}, server: {server_url})")
    
    # Создаем HTTP клиент
    http_client = WorkerHTTPClient(server_url)
    wait_s = float(os.environ.get("WORKER_TOKEN_WAIT_SECONDS") or "60")
    _wait_for_worker_token(http_client, timeout=wait_s)
    
    # Регистрируем обработчики сигналов
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    logger.info("Worker started, waiting for tasks...")
    
    # Импортируем модуль для сбора системной информации
    from .system_info import collect_system_info
    
    # Отправляем начальный heartbeat
    last_heartbeat = 0
    heartbeat_interval = 30  # Отправляем heartbeat каждые 30 секунд
    
    # Отправляем системную информацию при старте и периодически
    last_system_info_send = 0  # Время последней успешной отправки (0 = ещё не было успеха)
    last_system_info_attempt = 0  # Время последней попытки (для retry)
    system_info_interval = 300  # Успешная отправка каждые 5 минут
    system_info_retry_interval = 30  # Повторная попытка при неудаче каждые 30 сек (Docker: бэкенд может быть не готов при старте)
    
    # Пробуем отправить systemInfo при старте
    try:
        system_info = collect_system_info()
        last_system_info_attempt = time.time()
        if http_client.send_system_info(system_info):
            last_system_info_send = time.time()
            logger.debug("System info sent to server at startup")
        else:
            logger.debug("System info send at startup failed, will retry")
    except Exception as e:
        logger.warning(f"Error sending system info at startup: {e}")
    
    # Периодическая перезагрузка уровня логирования из настроек
    last_log_level_reload = 0
    log_level_reload_interval = 60  # Перезагружаем уровень логирования каждые 60 секунд
    
    # Счетчик последовательных 429 ошибок для exponential backoff
    rate_limit_retries = 0
    max_rate_limit_retries = 5
    
    while not shutdown_requested:
        try:
            # Отправляем heartbeat периодически
            current_time = time.time()
            if current_time - last_heartbeat >= heartbeat_interval:
                try:
                    heartbeat_success = http_client.heartbeat()
                    if heartbeat_success:
                        last_heartbeat = current_time
                    else:
                        logger.warning("Heartbeat failed — check WORKER_TOKEN / WORKER_TOKEN_FILE")
                except Exception as e:
                    error_str = str(e)
                    if '401' in error_str or 'UNAUTHORIZED' in error_str:
                        logger.warning("Heartbeat received 401 — token is invalid. Update WORKER_TOKEN / WORKER_TOKEN_FILE from Settings.")
                    else:
                        logger.warning(f"Error sending heartbeat: {e}")
            
            # Отправляем systemInfo периодически или повторно при неудаче (каждые 30 сек, пока не успех)
            need_send = (
                current_time - last_system_info_send >= system_info_interval
                or (last_system_info_send == 0 and current_time - last_system_info_attempt >= system_info_retry_interval)
            )
            if need_send:
                try:
                    system_info = collect_system_info()
                    last_system_info_attempt = current_time
                    if http_client.send_system_info(system_info):
                        last_system_info_send = current_time
                        logger.debug("System info sent to server")
                    elif last_system_info_send == 0:
                        logger.debug("System info send failed, will retry in %s sec", system_info_retry_interval)
                except Exception as e:
                    logger.warning(f"Error sending system info: {e}")
            
            # Перезагружаем уровень логирования периодически
            if current_time - last_log_level_reload >= log_level_reload_interval:
                try:
                    logging_setup.reload_log_level()
                    last_log_level_reload = current_time
                except Exception as e:
                    logger.warning(f"Error reloading log level: {e}")
            
            # Пытаемся claim следующую задачу
            try:
                execution_data = http_client.claim(
                    project_id=project_id,
                    max_concurrency=max_concurrency,
                    tags=tags
                )
                # Если claim успешен, сбрасываем счетчик rate limit ошибок и флаг перерегистрации
                rate_limit_retries = 0
            except Exception as e:
                error_str = str(e)
                error_type = type(e).__name__
                
                # Проверяем 401 (UNAUTHORIZED) - токен невалиден, нужно перерегистрироваться
                # Проверяем как строку ошибки, так и тип исключения
                is_401_error = (
                    '401' in error_str or 
                    'UNAUTHORIZED' in error_str.upper() or 
                    'Invalid token' in error_str or
                    (hasattr(e, 'response') and hasattr(e.response, 'status_code') and e.response.status_code == 401)
                )
                
                if is_401_error:
                    logger.error(
                        "Received 401 Unauthorized — worker token is invalid. "
                        "Update WORKER_TOKEN / WORKER_TOKEN_FILE from Settings."
                    )
                    time.sleep(poll_interval)
                    continue
                # Если получили 429 (TOO MANY REQUESTS), используем exponential backoff
                elif '429' in error_str or 'TOO MANY REQUESTS' in error_str:
                    if rate_limit_retries < max_rate_limit_retries:
                        rate_limit_retries += 1
                    # Exponential backoff: 2^retries * poll_interval, максимум 60 секунд
                    # Используем min(rate_limit_retries, 5) чтобы ограничить экспоненту
                    backoff_delay = min(poll_interval * (2 ** min(rate_limit_retries, 5)), 60)
                    logger.warning(f"Rate limited (attempt {rate_limit_retries}/{max_rate_limit_retries}), waiting {backoff_delay} seconds before retry...")
                    time.sleep(backoff_delay)
                else:
                    # Для других ошибок сбрасываем счетчик и используем обычную задержку
                    rate_limit_retries = 0
                    logger.error(f"Error claiming execution: {e}")
                    time.sleep(poll_interval)
                continue
            
            if execution_data:
                execution_id = execution_data.get('executionId')
                project_id_from_api = execution_data.get('projectId')
                
                logger.debug(f"Claimed execution {execution_id} for project {project_id_from_api}")
                
                # Выполняем run
                execute_run(
                    execution_id=execution_id,
                    execution_data=execution_data,
                    project_id=project_id_from_api,
                    http_client=http_client
                )
            else:
                # Нет задач в очереди, ждем
                time.sleep(poll_interval)
        
        except KeyboardInterrupt:
            logger.info("Received KeyboardInterrupt, shutting down...")
            shutdown_requested = True
        except Exception as e:
            logger.error(f"Error in worker loop: {e}", exc_info=True)
            time.sleep(poll_interval)
    
    logger.info("Worker stopped")
