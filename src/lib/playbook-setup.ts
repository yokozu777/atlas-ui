import type { ClusterPhase } from "@/lib/api";

export type PlaybookSetupFieldKind = "scalar" | "pve_templates";

export type PlaybookSetupValueType =
  | "text"
  | "password"
  | "boolean"
  | "ipv4"
  | "url"
  | "string_list"
  | "timezone"
  | "pve_templates"
  | "ssh_pub_status";

export type PlaybookSetupField = {
  key: string;
  label: string;
  input?: "text" | "password";
  placeholders?: string[];
  allowEmpty?: boolean;
  kind?: PlaybookSetupFieldKind;
  group?: string;
  valueType?: PlaybookSetupValueType;
  itemValueType?: "url" | "text";
  options?: string[];
  hint?: string;
};

export type PlaybookSetupSchema = {
  fields: PlaybookSetupField[];
};

export type PlaybookSetupContext = {
  pveFactory?: boolean;
};

export type VarsSetupOrigin = "leaf" | "env" | "org" | "missing";

export type PveTemplateEntry = {
  id: string;
  image_url: string;
};

export const PVE_TEMPLATE_KEYS = [
  "ubuntu-base",
  "oracle-base",
  "debian-base",
] as const;

export type PveTemplateName = (typeof PVE_TEMPLATE_KEYS)[number];

export type PveTemplatesMap = Record<string, PveTemplateEntry>;

export type SetupFieldValue = string | PveTemplatesMap;

const DNS_FIELD: PlaybookSetupField = {
  key: "dns_domain_suffix",
  label: "DNS domain",
  placeholders: ["example.com"],
  group: "Network",
  hint: "Same suffix is saved to every atlas-*.yml overlay.",
};

const SSH_PUB_FIELD: PlaybookSetupField = {
  key: "provision_ssh_public_key_file",
  label: "SSH on guests",
  group: "Guest",
  valueType: "ssh_pub_status",
  allowEmpty: true,
  hint: "Cloud-init installs the selected public key as pub_keys/localuser.pub.",
};

const CLUSTER_DOMAIN_FIELD: PlaybookSetupField = {
  key: "cluster_domain",
  label: "Cluster domain",
  placeholders: ["example.com"],
  group: "Network",
};

export const PVE_COMPUTE_SETUP_SCHEMA: PlaybookSetupSchema = {
  fields: [
    {
      key: "provision_gateway",
      label: "Gateway",
      group: "Network",
      valueType: "ipv4",
    },
    {
      key: "provision_proxmox_target_node",
      label: "Proxmox target node",
      group: "Proxmox",
    },
    {
      key: "provision_pve_host",
      label: "Proxmox host",
      group: "Proxmox",
      valueType: "ipv4",
    },
    { key: "provision_pve_user", label: "Proxmox SSH user", group: "Proxmox" },
    {
      key: "provision_pve_inventory_name",
      label: "PVE inventory name",
      group: "Proxmox",
    },
    {
      key: "provision_pve_inventory_group",
      label: "PVE inventory group",
      group: "Proxmox",
    },
    {
      key: "provision_vm_full_clone",
      label: "Full clone",
      group: "Guest",
      valueType: "boolean",
    },
    {
      key: "provision_vm_cloudinit_storage",
      label: "Cloud-init storage",
      group: "Guest",
    },
    {
      key: "provision_vm_network_bridge",
      label: "Network bridge",
      group: "Guest",
    },
    SSH_PUB_FIELD,
    {
      key: "provision_pve_upload_dir",
      label: "PVE upload dir",
      allowEmpty: true,
      group: "Guest",
    },
    {
      key: "provision_pve_templates",
      label: "Golden PVE templates",
      kind: "pve_templates",
      group: "Catalog",
    },
  ],
};

export const PVE_COMPUTE_SECRETS_SETUP_SCHEMA: PlaybookSetupSchema = {
  fields: [
    {
      key: "provision_pve_ssh_password",
      label: "Proxmox SSH password",
      input: "password",
      placeholders: ["CHANGEME"],
      group: "Secrets",
    },
    {
      key: "provision_proxmox_token_id",
      label: "Proxmox token id",
      placeholders: ["CHANGEME"],
      group: "Secrets",
    },
    {
      key: "provision_proxmox_token_secret",
      label: "Proxmox token secret",
      input: "password",
      placeholders: ["CHANGEME"],
      group: "Secrets",
    },
    {
      key: "provision_dns_key_secret",
      label: "DNS key secret",
      input: "password",
      placeholders: ["CHANGEME"],
      group: "Secrets",
    },
    {
      key: "provision_vm_cipassword",
      label: "Cloud-init password",
      input: "password",
      placeholders: ["CHANGEME"],
      group: "Secrets",
    },
  ],
};

function secretField(
  key: string,
  label: string,
  group: string,
  extraPlaceholders: string[] = [],
): PlaybookSetupField {
  return {
    key,
    label,
    input: "password",
    placeholders: ["CHANGEME", ...extraPlaceholders],
    group,
  };
}

export const FILE_SETUP_SCHEMAS: Record<string, PlaybookSetupSchema> = {
  "atlas-compute-provision.yml": {
    fields: [
      DNS_FIELD,
      { key: "provision_gateway", label: "Gateway", group: "Network", valueType: "ipv4" },
      { key: "provision_pve_host", label: "Proxmox host", group: "Proxmox", valueType: "ipv4" },
      { key: "provision_pve_user", label: "Proxmox SSH user", group: "Proxmox" },
      SSH_PUB_FIELD,
    ],
  },
  "atlas-compute-provision.secrets.yml": {
    fields: [
      {
        key: "provision_pve_ssh_password",
        label: "Proxmox SSH password",
        input: "password",
        placeholders: ["CHANGEME"],
        group: "Secrets",
      },
      {
        key: "provision_dns_key_secret",
        label: "DNS TSIG secret",
        input: "password",
        placeholders: ["CHANGEME"],
        group: "Secrets",
      },
    ],
  },
  "atlas-node-foundation.yml": {
    fields: [
      DNS_FIELD,
      CLUSTER_DOMAIN_FIELD,
      {
        key: "pkg_repo_nginx_domain",
        label: "Package mirror domain",
        group: "Repositories",
        hint: "Domain apt and yum drop-ins use, usually repo.<DNS domain>.",
      },
      {
        key: "pki_ca_url",
        label: "CA root URLs",
        group: "Certificates",
        valueType: "string_list",
        itemValueType: "url",
        allowEmpty: true,
      },
      { key: "timezone", label: "Timezone", group: "Time", valueType: "timezone" },
      {
        key: "ntp_servers",
        label: "NTP servers",
        group: "Time",
        valueType: "string_list",
      },
      {
        key: "reboot_system",
        label: "Reboot after setup",
        group: "System",
        valueType: "boolean",
      },
    ],
  },
  "atlas-node-foundation.secrets.yml": {
    fields: [
      {
        key: "initial_password",
        label: "Initial SSH password",
        input: "password",
        placeholders: ["CHANGEME"],
        group: "Secrets",
      },
    ],
  },
  "atlas-infra-edge.yml": {
    fields: [
      DNS_FIELD,
      CLUSTER_DOMAIN_FIELD,
      { key: "dns_server_ip", label: "DNS server IP", group: "Network" },
      { key: "timezone", label: "Timezone", group: "Time", valueType: "timezone" },
      {
        key: "setup_bind",
        label: "Setup BIND",
        group: "Features",
        valueType: "boolean",
      },
      {
        key: "setup_ntp",
        label: "Setup NTP",
        group: "Features",
        valueType: "boolean",
      },
      {
        key: "setup_stepca",
        label: "Setup step-ca",
        group: "Features",
        valueType: "boolean",
      },
      {
        key: "setup_infra_stats",
        label: "Setup infra stats",
        group: "Features",
        valueType: "boolean",
      },
      {
        key: "infra_cache_seed_load_enabled",
        label: "Load cache seed",
        group: "Cache",
        valueType: "boolean",
        hint: "Unpack the cache seed image onto the infra node so image pulls stay on that host.",
      },
      {
        key: "infra_cache_seed_load_image",
        label: "Cache seed image",
        group: "Cache",
        hint: "Image that carries the cache seed. Tag may be in the name or in Cache seed tag.",
      },
      {
        key: "infra_cache_seed_load_tag",
        label: "Cache seed tag",
        group: "Cache",
        hint: "Tag of the cache seed image. Must not be latest.",
      },
      {
        key: "helm_repo_nginx_cache_warm_enabled",
        label: "Warm Helm cache",
        group: "Cache",
        valueType: "boolean",
        hint: "Download chart indexes and packages through the Helm mirror. Leave off when the cache seed already filled the disk.",
      },
      {
        key: "bind_forwarders",
        label: "BIND forwarders",
        group: "BIND",
        valueType: "string_list",
      },
      {
        key: "bind_forward_policy",
        label: "BIND forward policy",
        group: "BIND",
      },
      {
        key: "bind_allow_query",
        label: "BIND allow query",
        group: "BIND",
        valueType: "string_list",
      },
      {
        key: "bind_allow_recursion",
        label: "BIND allow recursion",
        group: "BIND",
        valueType: "string_list",
      },
      {
        key: "ntp_allowed_networks",
        label: "NTP allowed networks",
        group: "NTP",
        valueType: "string_list",
      },
      {
        key: "stepca_init_name",
        label: "step-ca name",
        group: "Certificates",
      },
    ],
  },
  "atlas-infra-edge.secrets.yml": {
    fields: [
      {
        key: "provision_dns_key_secret",
        label: "Apex zone TSIG",
        input: "password",
        placeholders: ["CHANGEME"],
        group: "BIND",
        hint: "BIND key name is the DNS domain. Same bytes as DNS TSIG secret in compute-provision.",
      },
      {
        key: "external_dns_tsig_secret",
        label: "K8s zone TSIG",
        input: "password",
        placeholders: ["CHANGEME"],
        group: "BIND",
        hint: "BIND key name is k8s.<DNS domain>-key. cert-manager and external-dns must use this same value.",
      },
      {
        key: "external_dns_istio_tsig_secret",
        label: "Istio zone TSIG",
        input: "password",
        placeholders: ["CHANGEME"],
        group: "BIND",
        hint: "BIND key name is istio.<DNS domain>-key.",
      },
      {
        key: "stepca_init_password",
        label: "step-ca init password",
        input: "password",
        placeholders: ["CHANGEME"],
        group: "Certificates",
        hint: "Required when Setup step-ca is on.",
      },
    ],
  },
  "atlas-k8s-core.yml": {
    fields: [
      DNS_FIELD,
      CLUSTER_DOMAIN_FIELD,
      { key: "k8s_dns_domain", label: "Cluster DNS domain", group: "Network" },
      { key: "k8s_lb_hostname", label: "API load balancer hostname", group: "Network" },
      { key: "k8s_api_port", label: "API port", group: "Network" },
      { key: "vip_address", label: "API VIP", group: "Network", valueType: "ipv4" },
      { key: "pod_subnet", label: "Pod subnet", group: "Network" },
      { key: "service_subnet", label: "Service subnet", group: "Network" },
      { key: "k8s_cluster_name", label: "Cluster name", group: "Identity" },
      { key: "k8s_apt_repo_version", label: "Kubernetes apt repo", group: "Versions" },
      { key: "k8s_version_ubuntu", label: "Kubernetes version (Ubuntu)", group: "Versions" },
      { key: "k8s_version_oracle", label: "Kubernetes version (Oracle)", group: "Versions" },
      {
        key: "use_internal_docker_registry",
        label: "Internal Docker registry",
        group: "Registry",
        options: ["none", "registry", "harbor"],
        hint: "registry pulls through registry.<DNS domain> on the infra node.",
      },
      {
        key: "pkg_repo_nginx_ingress_domain",
        label: "Package repo nginx domain",
        group: "Registry",
        allowEmpty: true,
      },
      {
        key: "pki_ca_url",
        label: "CA root URLs",
        group: "Certificates",
        valueType: "string_list",
        itemValueType: "url",
      },
      {
        key: "ntp_servers",
        label: "NTP servers",
        group: "Time",
        valueType: "string_list",
      },
      {
        key: "k8s_lb_dns_tf_manage_a_record",
        label: "Manage API DNS with Terraform",
        group: "DNS",
        valueType: "boolean",
        hint: "When on, set the DNS key secret. Leave off when BIND already owns the hostname.",
      },
    ],
  },
  "atlas-k8s-core.secrets.yml": {
    fields: [
      {
        key: "vip_auth_pass",
        label: "Keepalived auth pass",
        input: "password",
        placeholders: ["CHANGEME"],
        group: "Load balancer",
        hint: "Keepalived PASS auth. Maximum 8 characters.",
      },
      {
        key: "k8s_lb_dns_key_secret",
        label: "API DNS key secret",
        input: "password",
        placeholders: ["CHANGEME"],
        allowEmpty: true,
        group: "DNS",
        hint: "Required only when Manage API DNS with Terraform is on and provision_dns_key_secret is unset.",
      },
    ],
  },
  "atlas-k8s-addons.yml": {
    fields: [
      DNS_FIELD,
      CLUSTER_DOMAIN_FIELD,
      { key: "k8s_dns_domain", label: "Cluster DNS domain", group: "Network" },
      { key: "k8s_lb_hostname", label: "API load balancer hostname", group: "Network" },
      { key: "k8s_api_port", label: "API port", group: "Network" },
      { key: "vip_address", label: "API VIP", group: "Network", valueType: "ipv4" },
      { key: "pod_subnet", label: "Pod subnet", group: "Network" },
      { key: "cluster_dns_ip", label: "Cluster DNS IP", group: "Network", valueType: "ipv4" },
      { key: "dns_server_ip", label: "DNS server IP", group: "Network", valueType: "ipv4" },
      { key: "k8s_cluster_name", label: "Cluster name", group: "Identity" },
      { key: "helm_version", label: "Helm archive URL", group: "Helm", valueType: "url" },
      {
        key: "use_internal_helm_repo",
        label: "Internal Helm repo",
        group: "Helm",
        options: ["none", "nginx", "nexus"],
        hint: "nginx pulls charts from helm.<DNS domain> on the infra node.",
      },
      {
        key: "helm_repo_nginx_ingress_domain",
        label: "Helm repo nginx domain",
        group: "Helm",
        allowEmpty: true,
      },
      { key: "metallb_ip_pool", label: "MetalLB IP pool", group: "Ingress" },
      {
        key: "kube_apiserver_oidc_enabled",
        label: "API server OIDC",
        group: "OIDC",
        valueType: "boolean",
      },
    ],
  },
  "atlas-k8s-addons.secrets.yml": {
    fields: [
      secretField("grafana_admin_password", "Grafana admin password", "Grafana"),
      secretField("keycloak_admin_password", "Keycloak admin password", "Keycloak"),
      secretField("keycloak_oidc_user_password", "Keycloak OIDC user password", "Keycloak", [
        "CHANGEME_oidc_user",
      ]),
      secretField("oauth2_proxy_client_secret", "oauth2-proxy client secret", "OIDC", [
        "CHANGEME_oauth2_proxy_client_secret_32b",
      ]),
      secretField("oauth2_proxy_cookie_secret", "oauth2-proxy cookie secret", "OIDC", [
        "CHANGEME_oauth2_proxy_cookie_secret_32b",
      ]),
      secretField("envoy_gateway_oidc_client_secret", "Envoy Gateway OIDC client secret", "OIDC", [
        "CHANGEME_envoy_gateway_oidc_client_secret_32b",
      ]),
      secretField("vault_oidc_client_secret", "Vault OIDC client secret", "OIDC", [
        "CHANGEME_vault_oidc_client_secret_32b",
      ]),
      secretField("argocd_oidc_client_secret", "Argo CD OIDC client secret", "OIDC", [
        "CHANGEME_argocd_oidc_client_secret_32b",
      ]),
      secretField("pinniped_supervisor_client_secret", "Pinniped supervisor client secret", "OIDC", [
        "CHANGEME_pinniped_supervisor_client_secret_32b",
      ]),
      secretField("mailu_secret_key", "Mailu secret key", "Mail", [
        "CHANGEME_mailu_secret_key_32bytesxx",
      ]),
      secretField("mailu_initial_password", "Mailu initial password", "Mail", [
        "CHANGEME_mailu_initial",
      ]),
      secretField("external_dns_tsig_secret", "ExternalDNS TSIG", "DNS", [
        "CHANGEME_external_dns_tsig_secret_base64",
      ]),
      secretField("external_dns_apex_tsig_secret", "ExternalDNS apex TSIG", "DNS", [
        "CHANGEME_external_dns_apex_tsig_secret_base64",
      ]),
      secretField("external_dns_istio_tsig_secret", "ExternalDNS Istio TSIG", "DNS", [
        "CHANGEME_external_dns_istio_tsig_secret_base64",
      ]),
      secretField("elastic_password", "Elastic password", "Elastic", ["CHANGEME_elastic"]),
      secretField("elastic_cert_password", "Elastic cert password", "Elastic", [
        "CHANGEME_elastic_cert",
      ]),
      secretField("elastic_logger_password", "Elastic logger password", "Elastic", [
        "CHANGEME_elastic_logger",
      ]),
      secretField("elastic_admin_password", "Elastic admin password", "Elastic", [
        "CHANGEME_elastic_admin",
      ]),
      secretField("elastic_jaeger_password", "Elastic Jaeger password", "Elastic", [
        "CHANGEME_elastic_jaeger",
      ]),
      secretField("kibana_elastic_password", "Kibana elastic password", "Elastic", [
        "CHANGEME_kibana_elastic",
      ]),
      secretField("kibana_encryption_key", "Kibana encryption key", "Elastic", [
        "CHANGEME_kibana_encryption_key_min_32_chars",
      ]),
      secretField("argocd_admin_password_bcrypt", "Argo CD admin password bcrypt", "Argo"),
      secretField("ceph_dashboard_password", "Ceph dashboard password", "Ceph"),
      secretField("sentry_smtp_password", "Sentry SMTP password", "Sentry", [
        "CHANGEME_sentry_smtp",
      ]),
      secretField("sentry_admin_password", "Sentry admin password", "Sentry", [
        "CHANGEME_sentry_admin",
      ]),
      secretField("alertmanager_smtp_password", "Alertmanager SMTP password", "Sentry", [
        "CHANGEME_alertmanager_smtp",
      ]),
      secretField("graylog_root_password", "Graylog root password", "Sentry", [
        "CHANGEME_graylog_root_password",
      ]),
      secretField("vault_admin_password", "Vault admin password", "Vault", [
        "CHANGEME_vault_admin",
      ]),
    ],
  },
};

const DEFAULT_PLACEHOLDERS = ["example.com", "changeme"];

export function emptyPveTemplatesMap(): PveTemplatesMap {
  const next: PveTemplatesMap = {};
  for (const name of PVE_TEMPLATE_KEYS) {
    next[name] = { id: "", image_url: "" };
  }
  return next;
}

export function normalizePveTemplatesMap(value: unknown): PveTemplatesMap {
  const next = emptyPveTemplatesMap();
  if (!value || typeof value !== "object") return next;
  const raw = value as Record<string, unknown>;
  for (const name of PVE_TEMPLATE_KEYS) {
    const entry = raw[name];
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    next[name] = {
      id: item.id == null ? "" : String(item.id),
      image_url: item.image_url == null ? "" : String(item.image_url),
    };
  }
  return next;
}

export function isPveTemplatesMissing(value: unknown): boolean {
  const map = normalizePveTemplatesMap(value);
  return PVE_TEMPLATE_KEYS.some((name) => {
    const entry = map[name];
    return !entry.id.trim() || !entry.image_url.trim();
  });
}

export function varsFileBaseName(name: string): string {
  const parts = name.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || name;
}

export function isSecretsVarsFile(name: string): boolean {
  return /\.secrets\.ya?ml$/i.test(varsFileBaseName(name));
}

export function playbookNameFromVarsFile(name: string): string {
  return varsFileBaseName(name)
    .replace(/\.secrets\.ya?ml$/i, "")
    .replace(/\.ya?ml$/i, "");
}

export function originFromVarsSetupFile(
  field: PlaybookSetupField,
  file: {
    keys?: Record<string, { origin?: string; value?: unknown; comment?: string }>;
    nested?: Record<
      string,
      { origin?: string; value?: unknown; comment?: string }
    >;
  },
): VarsSetupOrigin {
  const payload =
    field.kind === "pve_templates"
      ? (file.nested?.[field.key] ?? file.keys?.[field.key])
      : file.keys?.[field.key];
  const origin = payload?.origin;
  if (
    origin === "leaf" ||
    origin === "env" ||
    origin === "org" ||
    origin === "missing"
  ) {
    return origin;
  }
  return "missing";
}

/** Same secret stored under different keys. A field search includes the whole group. */
export const SECRET_REUSE_GROUPS: readonly (readonly string[])[] = [
  [
    "provision_dns_key_secret",
    "external_dns_apex_tsig_secret",
    "k8s_lb_dns_key_secret",
  ],
  ["external_dns_tsig_secret"],
  ["external_dns_istio_tsig_secret"],
];

export type SecretReuseHit = {
  key: string;
  clusterId: string;
  file: string;
  origin: string;
  value: string;
};

export type SecretReuseChoice = {
  id: string;
  label: string;
  value: string;
};

export function reuseKeysFor(fieldKey: string): string[] {
  const group = SECRET_REUSE_GROUPS.find((keys) => keys.includes(fieldKey));
  return group ? [...group] : [fieldKey];
}

export function setupFieldLabel(key: string, file = ""): string {
  const name = file.split("/").pop() ?? "";
  const fromFile = name ? FILE_SETUP_SCHEMAS[name] : undefined;
  const direct = fromFile?.fields.find((field) => field.key === key);
  if (direct?.label) return direct.label;
  for (const schema of Object.values(FILE_SETUP_SCHEMAS)) {
    const field = schema.fields.find((item) => item.key === key);
    if (field?.label) return field.label;
  }
  return key;
}

export function secretReuseChoices(
  fieldKey: string,
  clusterId: string,
  hits: SecretReuseHit[],
): SecretReuseChoice[] {
  const keys = new Set(reuseKeysFor(fieldKey));
  const relevant = hits.filter(
    (hit) =>
      keys.has(hit.key) &&
      hit.value.trim() !== "" &&
      !(hit.clusterId === clusterId && hit.key === fieldKey),
  );
  const byValue = new Map<string, SecretReuseHit[]>();
  for (const hit of relevant) {
    const list = byValue.get(hit.value) ?? [];
    list.push(hit);
    byValue.set(hit.value, list);
  }
  return [...byValue.entries()].map(([value, sources]) => {
    const clusters = [
      ...new Set(sources.map((source) => source.clusterId)),
    ].sort();
    const labels = [
      ...new Set(
        sources.map((source) => setupFieldLabel(source.key, source.file)),
      ),
    ];
    return {
      id: sources
        .map((source) => `${source.clusterId}|${source.file}|${source.key}`)
        .sort()
        .join(","),
      label: `${clusters.join(", ")} · ${labels.join(" / ")}`,
      value,
    };
  });
}

export function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatStringList(value: unknown): string {
  return parseStringList(value).join("\n");
}

export function valuesFromVarsSetupFile(
  schema: PlaybookSetupSchema,
  file: {
    keys?: Record<string, { origin?: string; value?: unknown; comment?: string }>;
    nested?: Record<
      string,
      { origin?: string; value?: unknown; comment?: string }
    >;
  },
): Record<string, SetupFieldValue> {
  const values: Record<string, SetupFieldValue> = {};
  for (const field of schema.fields) {
    if (field.kind === "pve_templates") {
      values[field.key] = normalizePveTemplatesMap(
        file.nested?.[field.key]?.value ?? file.keys?.[field.key]?.value,
      );
      continue;
    }
    const raw = file.keys?.[field.key]?.value;
    if (field.valueType === "string_list") {
      values[field.key] = formatStringList(raw);
    } else {
      values[field.key] = raw == null ? "" : String(raw);
    }
  }
  return values;
}

export function commentFromVarsSetupFile(
  field: PlaybookSetupField,
  file: {
    keys?: Record<string, { comment?: string }>;
    nested?: Record<string, { comment?: string }>;
  },
): string {
  if (field.kind === "pve_templates") {
    return file.nested?.[field.key]?.comment || file.keys?.[field.key]?.comment || "";
  }
  return file.keys?.[field.key]?.comment || "";
}

export function overlayVarsPath(playbook: string): string {
  return `group_vars/all/${playbook}.yml`;
}

export function secretsVarsPath(playbook: string): string {
  return `group_vars/all/${playbook}.secrets.yml`;
}

export function setupSchemaForVarsFile(
  fileName: string,
  text: string,
  ctx?: PlaybookSetupContext,
): PlaybookSetupSchema {
  const base = varsFileBaseName(fileName);
  if (ctx?.pveFactory && base === "atlas-compute-provision.yml") {
    return PVE_COMPUTE_SETUP_SCHEMA;
  }
  if (ctx?.pveFactory && base === "atlas-compute-provision.secrets.yml") {
    return PVE_COMPUTE_SECRETS_SETUP_SCHEMA;
  }
  const known = FILE_SETUP_SCHEMAS[base];
  if (known) return known;
  const secrets = isSecretsVarsFile(fileName);
  return {
    fields: listTopLevelScalarKeys(text).map((key) => ({
      key,
      label: key,
      input: secrets ? "password" : "text",
      placeholders: ["CHANGEME", "example.com"],
      group: secrets ? "Secrets" : "General",
    })),
  };
}

export function envScopeLabel(clusterId: string, origin: VarsSetupOrigin): string {
  if (origin === "org") return "Default";
  const env = clusterId
    .split("/")
    .map((part) => part.trim())
    .find(Boolean);
  return env ? `env/${env}` : "Environment";
}

export function setupFieldGroup(field: PlaybookSetupField): string {
  if (field.group) return field.group;
  if (field.input === "password" || isSecretsVarsFile(field.key)) return "Secrets";
  return "General";
}

export function groupedSetupFields(
  fields: PlaybookSetupField[],
): { group: string; fields: PlaybookSetupField[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, PlaybookSetupField[]>();
  for (const field of fields) {
    const group = setupFieldGroup(field);
    if (!buckets.has(group)) {
      buckets.set(group, []);
      order.push(group);
    }
    buckets.get(group)!.push(field);
  }
  return order.map((group) => ({ group, fields: buckets.get(group)! }));
}

const SETUP_SECRET_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateSetupSecret(key: string): string {
  const length = key === "vip_auth_pass" ? 8 : 32;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => SETUP_SECRET_ALPHABET[byte % SETUP_SECRET_ALPHABET.length],
  ).join("");
}

export function setupFieldCopyText(
  field: PlaybookSetupField,
  value: SetupFieldValue | undefined,
): string {
  if (field.kind === "pve_templates" || setupFieldValueType(field) === "pve_templates") {
    return JSON.stringify(normalizePveTemplatesMap(value));
  }
  if (typeof value === "string") return value;
  return "";
}

export function setupFieldValueType(
  field: PlaybookSetupField,
): PlaybookSetupValueType {
  if (field.kind === "pve_templates") return "pve_templates";
  if (field.valueType) return field.valueType;
  if (field.input === "password") return "password";
  const key = field.key;
  if (/(_full_clone|_git_push)$/.test(key)) return "boolean";
  if (/(^|_)(host|gateway)$/.test(key)) return "ipv4";
  return "text";
}

export function isSetupFieldRequired(field: PlaybookSetupField): boolean {
  return !field.allowEmpty;
}

const IPV4_OCTET = /^(0|[1-9]\d{0,2})$/;

export function isIpv4Address(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!IPV4_OCTET.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

export function isJinjaValue(value: string): boolean {
  return value.includes("{{");
}

function httpUrlInvalid(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Invalid URL";
    }
  } catch {
    return "Invalid URL";
  }
  return null;
}

export function ianaTimeZones(): string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  const pinned = ["UTC", "Europe/Moscow"];
  const seen = new Set<string>();
  const zones: string[] = [];
  for (const zone of [...pinned, ...supported]) {
    if (!zone || seen.has(zone)) continue;
    seen.add(zone);
    zones.push(zone);
  }
  const head = pinned.filter((zone) => seen.has(zone));
  const rest = zones
    .filter((zone) => !pinned.includes(zone))
    .sort((a, b) => a.localeCompare(b));
  return [...head, ...rest];
}

export function setupFieldInvalidMessage(
  field: PlaybookSetupField,
  value: SetupFieldValue | undefined,
): string | null {
  if (field.kind === "pve_templates") {
    const map = normalizePveTemplatesMap(value);
    for (const name of PVE_TEMPLATE_KEYS) {
      const url = map[name]?.image_url?.trim() ?? "";
      if (!url || isJinjaValue(url)) continue;
      const message = httpUrlInvalid(url);
      if (message) return message;
    }
    return null;
  }
  const type = setupFieldValueType(field);
  if (type === "string_list") {
    for (const item of parseStringList(value)) {
      if (isJinjaValue(item)) continue;
      if (field.itemValueType === "url") {
        const message = httpUrlInvalid(item);
        if (message) return message;
      }
    }
    return null;
  }
  if (value == null || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || isJinjaValue(trimmed)) return null;
  if (type === "ipv4" && !isIpv4Address(trimmed)) {
    return "Invalid IPv4 address";
  }
  if (type === "url") return httpUrlInvalid(trimmed);
  return null;
}

export function setupValuesEqual(
  a: SetupFieldValue | undefined,
  b: SetupFieldValue | undefined,
): boolean {
  return JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
}

export function setupSearchHaystack(
  field: PlaybookSetupField,
  value: SetupFieldValue | undefined,
  description: string,
): string {
  const parts = [field.key, field.label, description];
  if (typeof value === "string") {
    parts.push(value);
  } else if (value && typeof value === "object") {
    for (const name of PVE_TEMPLATE_KEYS) {
      const entry = value[name];
      if (!entry) continue;
      parts.push(name, entry.id, entry.image_url);
    }
  }
  return parts.join(" ").toLowerCase();
}

export function phaseAliasForPlaybook(
  playbook: string,
  phases: ClusterPhase[],
): string {
  const prefix = `${playbook}/`;
  const match = phases.find((phase) => {
    const ref = (phase.ref || "").trim();
    return ref === playbook || ref.startsWith(prefix);
  });
  return match?.alias ?? "";
}

function normalizeScalar(value: string): string {
  return value.trim();
}

export function isMissingSetupValue(
  value: SetupFieldValue | undefined,
  field: PlaybookSetupField,
): boolean {
  if (field.kind === "pve_templates") {
    return isPveTemplatesMissing(value);
  }
  if (setupFieldValueType(field) === "string_list") {
    const items = parseStringList(value);
    if (items.length === 0) return !field.allowEmpty;
    if (items.every((item) => isJinjaValue(item))) return false;
    const placeholders = [
      ...DEFAULT_PLACEHOLDERS,
      ...(field.placeholders ?? []).map((item) => item.toLowerCase()),
    ];
    return items.every((item) => placeholders.includes(item.toLowerCase()));
  }
  if (value == null || typeof value !== "string") return true;
  const trimmed = normalizeScalar(value);
  if (!trimmed) return !field.allowEmpty;
  if (isJinjaValue(trimmed)) return false;
  const placeholders = [
    ...DEFAULT_PLACEHOLDERS,
    ...(field.placeholders ?? []).map((item) => item.toLowerCase()),
  ];
  return placeholders.includes(trimmed.toLowerCase());
}

export function missingSetupFieldsFromText(
  schema: PlaybookSetupSchema,
  text: string,
): PlaybookSetupField[] {
  return schema.fields.filter((field) =>
    isMissingSetupValue(readYamlScalar(text, field.key), field),
  );
}

export function missingFieldsLabel(count: number): string {
  if (count <= 0) return "Ready to run";
  if (count === 1) return "1 field missing";
  return `${count} fields missing`;
}

export function setupProgressFromText(
  schema: PlaybookSetupSchema,
  text: string,
): { filled: number; total: number; missing: number } {
  const missing = missingSetupFieldsFromText(schema, text).length;
  const total = schema.fields.length;
  return { filled: Math.max(0, total - missing), total, missing };
}

export function setupProgressFromValues(
  schema: PlaybookSetupSchema,
  values: Record<string, SetupFieldValue>,
): { filled: number; total: number; missing: number } {
  const missing = schema.fields.filter((field) =>
    isMissingSetupValue(values[field.key], field),
  ).length;
  const total = schema.fields.length;
  return { filled: Math.max(0, total - missing), total, missing };
}

const KEY_LINE = /^([ \t]*)([A-Za-z0-9_]+)[ \t]*:([ \t]*)(.*)$/;

const DECORATIVE_COMMENT = /^[-=#]{3,}$/;

function commentBody(line: string): string {
  return line.trim().replace(/^#\s?/, "").trim();
}

function isDecorativeComment(line: string): boolean {
  const body = commentBody(line);
  return !body || DECORATIVE_COMMENT.test(body);
}

export function readYamlCommentAbove(text: string, key: string): string {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trimStart().startsWith("#")) continue;
    const match = KEY_LINE.exec(line);
    if (!match || match[2] !== key) continue;
    const block: string[] = [];
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = lines[cursor];
      if (!previous.trimStart().startsWith("#")) break;
      block.unshift(previous);
    }
    return block
      .filter((item) => !isDecorativeComment(item))
      .map((item) => commentBody(item))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function unquoteYamlScalar(raw: string): string {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function quoteYamlScalar(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9._/-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function splitValueAndComment(rest: string): { value: string; comment: string } {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < rest.length; i += 1) {
    const char = rest[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "#" && !inSingle && !inDouble) {
      if (i === 0 || rest[i - 1] === " " || rest[i - 1] === "\t") {
        return {
          value: rest.slice(0, i).trimEnd(),
          comment: rest.slice(i),
        };
      }
    }
  }
  return { value: rest.trimEnd(), comment: "" };
}

function nextSignificantLine(
  lines: string[],
  start: number,
): string | undefined {
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    return line;
  }
  return undefined;
}

export function listTopLevelScalarKeys(text: string): string[] {
  const lines = text.split("\n");
  const keys: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trimStart().startsWith("#")) continue;
    const match = KEY_LINE.exec(line);
    if (!match || match[1].length > 0) continue;
    const key = match[2];
    const { value } = splitValueAndComment(match[4]);
    const trimmed = value.trim();
    if (trimmed === "|" || trimmed === ">" || trimmed === "|-" || trimmed === ">-") {
      continue;
    }
    if (!trimmed) {
      const next = nextSignificantLine(lines, index + 1);
      if (next) {
        const nested = KEY_LINE.exec(next);
        if (nested && nested[1].length > 0) continue;
        if (next.trimStart().startsWith("-")) continue;
      }
    }
    keys.push(key);
  }
  return keys;
}

export function readYamlScalar(text: string, key: string): string | undefined {
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("#")) continue;
    const match = KEY_LINE.exec(line);
    if (!match || match[2] !== key) continue;
    const { value } = splitValueAndComment(match[4]);
    return unquoteYamlScalar(value.trim());
  }
  return undefined;
}

export function setYamlScalar(text: string, key: string, value: string): string {
  const quoted = quoteYamlScalar(value);
  const lines = text.split("\n");
  let found = false;
  const next = lines.map((line) => {
    if (found || line.trimStart().startsWith("#")) return line;
    const match = KEY_LINE.exec(line);
    if (!match || match[2] !== key) return line;
    found = true;
    const { comment } = splitValueAndComment(match[4]);
    const commentPart = comment ? ` ${comment}` : "";
    return `${match[1]}${key}:${match[3] || " "}${quoted}${commentPart}`;
  });
  if (found) {
    return next.join("\n");
  }
  const prefix = text && !text.endsWith("\n") ? `${text}\n` : text;
  return `${prefix}${key}: ${quoted}\n`;
}

export function setYamlScalars(
  text: string,
  updates: Record<string, string>,
): string {
  let next = text;
  for (const [key, value] of Object.entries(updates)) {
    next = setYamlScalar(next, key, value);
  }
  return next;
}
