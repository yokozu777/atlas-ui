"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import type {
  VaultFileRow,
  VaultKeyRow,
  VaultRow,
} from "@/components/project-vaults/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { stargateJson } from "@/lib/stargate";

export function VaultToolsTab({
  projectId,
  vaults,
  keys,
  vaultFiles,
  onReload,
}: {
  projectId: string;
  vaults: VaultRow[];
  keys: VaultKeyRow[];
  vaultFiles: VaultFileRow[];
  onReload: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [cryptVaultId, setCryptVaultId] = useState("");
  const [plain, setPlain] = useState("");
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileKeyId, setFileKeyId] = useState("");
  const [fileVaultLabel, setFileVaultLabel] = useState("");

  useEffect(() => {
    if (!cryptVaultId && vaults[0]?.id) {
      setCryptVaultId(vaults[0].id ?? "");
    }
    if (!fileKeyId && keys[0]?.id) {
      setFileKeyId(keys[0].id ?? "");
    }
  }, [vaults, keys, cryptVaultId, fileKeyId]);

  async function crypt(kind: "encrypt" | "decrypt") {
    if (!cryptVaultId) {
      toast.error("Select a vault");
      return;
    }
    setBusy(true);
    try {
      const data = await stargateJson<{ content?: string }>(
        `/projects/${projectId}/vaults/${cryptVaultId}/${kind}`,
        { method: "POST", body: JSON.stringify({ content: plain }) },
      );
      setPlain(data.content ?? "");
      toast.success(kind === "encrypt" ? "Encrypted" : "Decrypted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadVaultFile(path: string) {
    setFilePath(path);
    setBusy(true);
    try {
      const data = await stargateJson<{ content?: string }>(
        `/projects/${projectId}/vault-files/get?path=${encodeURIComponent(path)}`,
      );
      setFileContent(data.content ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveVaultFile() {
    if (!filePath.trim()) {
      toast.error("Select a vault file path");
      return;
    }
    setBusy(true);
    try {
      await stargateJson(`/projects/${projectId}/vault-files/save`, {
        method: "POST",
        body: JSON.stringify({
          path: filePath.trim(),
          content: fileContent,
          keyId: fileKeyId || undefined,
          vaultId: fileVaultLabel.trim() || undefined,
        }),
      });
      toast.success("File saved");
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function cryptFile(kind: "encrypt" | "decrypt") {
    if (!fileKeyId) {
      toast.error("Select a key");
      return;
    }
    if (kind === "encrypt" && !fileVaultLabel.trim()) {
      toast.error("ansible-vault id required to encrypt");
      return;
    }
    setBusy(true);
    try {
      const data = await stargateJson<{ content?: string }>(
        `/projects/${projectId}/vault-files/${kind}`,
        {
          method: "POST",
          body: JSON.stringify({
            content: fileContent,
            keyId: fileKeyId,
            vaultId: fileVaultLabel.trim() || undefined,
          }),
        },
      );
      setFileContent(data.content ?? "");
      toast.success(kind === "encrypt" ? "Encrypted" : "Decrypted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 space-y-1">
        <p className="text-[13px] text-muted-foreground">Snippet</p>
        <h2 className="font-display text-2xl font-medium tracking-tight">
          Encrypt / decrypt
        </h2>
      </div>
      <Panel className="mb-8 space-y-3 p-6">
        <Select
          value={cryptVaultId || null}
          onValueChange={(value) => setCryptVaultId(value ?? "")}
        >
          <SelectTrigger className="max-w-xs">
            <SelectValue placeholder="Select a vault…" />
          </SelectTrigger>
          <SelectContent>
            {vaults
              .filter((row): row is VaultRow & { id: string } => Boolean(row.id))
              .map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Textarea
          className="min-h-40 font-mono text-xs"
          value={plain}
          onChange={(e) => setPlain(e.target.value)}
          placeholder="YAML or text"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void crypt("encrypt")}
          >
            Encrypt
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void crypt("decrypt")}
          >
            Decrypt
          </Button>
        </div>
      </Panel>
      <div className="mb-3 space-y-1">
        <p className="text-[13px] text-muted-foreground">Files</p>
        <h2 className="font-display text-2xl font-medium tracking-tight">
          Vault files
        </h2>
      </div>
      <Panel className="space-y-3 p-6">
        <Select
          value={filePath || null}
          onValueChange={(value) => {
            if (value) void loadVaultFile(value);
            else {
              setFilePath("");
              setFileContent("");
            }
          }}
        >
          <SelectTrigger className="max-w-xl">
            <SelectValue placeholder="Select a path…" />
          </SelectTrigger>
          <SelectContent>
            {vaultFiles
              .filter(
                (row): row is VaultFileRow & { path: string } => Boolean(row.path),
              )
              .map((row) => (
                <SelectItem key={row.path} value={row.path}>
                  {row.path}
                  {row.keyName ? ` (${row.keyName})` : ""}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="or type group_vars/all.yml"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Select
            value={fileKeyId || null}
            onValueChange={(value) => setFileKeyId(value ?? "")}
          >
            <SelectTrigger className="min-w-40">
              <SelectValue placeholder="Select a key…" />
            </SelectTrigger>
            <SelectContent>
              {keys
                .filter((row): row is VaultKeyRow & { id: string } => Boolean(row.id))
                .map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            className="max-w-xs"
            placeholder="ansible-vault id"
            value={fileVaultLabel}
            onChange={(e) => setFileVaultLabel(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !filePath}
            onClick={() => void loadVaultFile(filePath)}
          >
            Load
          </Button>
        </div>
        <Textarea
          className="min-h-40 font-mono text-xs"
          value={fileContent}
          onChange={(e) => setFileContent(e.target.value)}
          placeholder="file YAML"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void saveVaultFile()}>
            Save file
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void cryptFile("encrypt")}
          >
            Encrypt
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void cryptFile("decrypt")}
          >
            Decrypt
          </Button>
        </div>
      </Panel>
    </div>
  );
}
