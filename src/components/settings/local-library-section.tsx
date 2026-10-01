"use client";

import { Library } from "lucide-react";

import { LibrarySetupForm } from "@/components/settings/library-setup-form";
import { SettingsSection } from "@/components/settings/settings-section";

export function LocalLibrarySection() {
  return (
    <SettingsSection icon={<Library className="size-4" />} title="atlas-proxmox-library">
      <LibrarySetupForm />
      <p className="text-xs text-muted-foreground">
        The hub runs <code className="font-mono">proxmox-library</code> from this
        checkout for Hypervisors, host storage lists, VMID checks, and API tokens.
        Override the path with <code className="font-mono">ATLAS_PROXMOX_LIBRARY_ROOT</code>.
      </p>
    </SettingsSection>
  );
}
