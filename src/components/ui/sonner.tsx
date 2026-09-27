"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast, Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

import { getNotificationHref } from "@/lib/notification-inbox"

function ToastNavigator() {
  const router = useRouter()

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (target.closest("button")) {
        return
      }
      const toastEl = target.closest("[data-sonner-toast]")
      if (!(toastEl instanceof HTMLElement)) {
        return
      }
      const id = toastEl.getAttribute("data-testid")
      if (!id) {
        return
      }
      const href = getNotificationHref(id)
      if (!href) {
        return
      }
      event.preventDefault()
      toast.dismiss(id)
      router.push(href)
    }

    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [router])

  return null
}

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <>
      <ToastNavigator />
      <Sonner
        theme="dark"
        position="top-right"
        closeButton
        className="toaster group"
        icons={{
          success: (
            <CircleCheckIcon className="size-4" />
          ),
          info: (
            <InfoIcon className="size-4" />
          ),
          warning: (
            <TriangleAlertIcon className="size-4" />
          ),
          error: (
            <OctagonXIcon className="size-4" />
          ),
          loading: (
            <Loader2Icon className="size-4 animate-spin" />
          ),
        }}
        style={
          {
            "--normal-bg": "var(--color-panel-solid, #1c1c1f)",
            "--normal-bg-hover": "var(--gray-3, #232326)",
            "--normal-text": "var(--gray-12, oklch(0.93 0 0))",
            "--normal-border": "var(--gray-a7, oklch(1 0 0 / 22%))",
            "--border-radius": "var(--radius)",
            "--toast-close-button-start": "unset",
            "--toast-close-button-end": "0",
            "--toast-close-button-transform": "translate(35%, -35%)",
          } as React.CSSProperties
        }
        toastOptions={{
          closeButton: true,
          closeButtonAriaLabel: "Close",
          classNames: {
            toast: "cn-toast",
            closeButton: "cn-toast-close",
          },
        }}
        {...props}
      />
    </>
  )
}

export { Toaster }
