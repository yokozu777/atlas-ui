"use client";

import { KeyRound } from "lucide-react";

import { ClusterctlSshKeyPicker } from "@/components/clusterctl-ssh-key-picker";
import { SettingsHint, SettingsSection } from "@/components/settings/settings-section";

export function ClusterctlSshKeySection() {
  return (
    <SettingsSection icon={<KeyRound className="size-4" />} title="Atlas SSH key">
      <SettingsHint>
        Private key Atlas uses as root SSH on provisioned VMs (Ansible / docker
        executor). Playbook git clone uses the project{" "}
        <span className="font-medium">Playbook git pull key</span>, not this one.
        Create the key under System / Secrets Manager (paste or generate).
      </SettingsHint>
      <ClusterctlSshKeyPicker
        id="clusterctl-ssh-secret"
        label="Atlas SSH key"
        hint="Written to the cluster as pub_keys/localuser.pub on Init when that option is on."
      />
    </SettingsSection>
  );
}
