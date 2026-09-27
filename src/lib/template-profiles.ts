import { INIT_TEMPLATES } from "./templates.ts";

export type TemplateId = (typeof INIT_TEMPLATES)[number];

export type TemplateRole = {
  label: string;
  count: number;
};

export type SpecItem = {
  name: string;
  version: string;
};

export type SpecGroup = {
  title: string;
  items: SpecItem[];
};

export type FlowNode = {
  label: string;
  count?: number;
  hint?: string;
};

export type FlowStage = {
  title: string;
  link?: "to" | "both";
  chain?: boolean;
  nodes: FlowNode[];
};

export type TemplateProfile = {
  servers: number;
  technologies: string;
  summary: string;
  roles: TemplateRole[];
  flow: FlowStage[];
  spec: SpecGroup[];
};

const K8S_ADDONS: SpecItem[] = [
  { name: "Calico", version: "v3.32.1" },
  { name: "Prometheus", version: "88.5.3" },
  { name: "Blackbox exporter", version: "11.17.2" },
  { name: "Prometheus adapter", version: "5.3.0" },
  { name: "Volume snapshotter", version: "8.6.0" },
  { name: "Rook operator", version: "v1.20.6" },
  { name: "Rook cluster", version: "v1.20.6" },
  { name: "Rook CSI", version: "1.0.4" },
  { name: "Thanos", version: "0.32.0" },
  { name: "MetalLB", version: "0.16.1" },
  { name: "Envoy Gateway", version: "v1.8.3" },
  { name: "ExternalDNS", version: "1.21.1" },
  { name: "cert-manager", version: "v1.21.1" },
  { name: "trust-manager", version: "v0.24.0" },
  { name: "Elasticsearch", version: "8.5.1" },
  { name: "Kibana", version: "8.5.1" },
  { name: "Fluent Bit", version: "0.58.1" },
  { name: "Istio", version: "1.30.3" },
  { name: "ExternalDNS for Istio", version: "1.21.1" },
  { name: "Jaeger", version: "4.12.0" },
  { name: "OpenTelemetry Collector", version: "0.170.0" },
  { name: "Kiali", version: "2.30.0" },
  { name: "Chaos Mesh", version: "2.8.4" },
  { name: "Falco", version: "9.1.0" },
  { name: "Kyverno", version: "3.9.0" },
  { name: "Policy Reporter", version: "3.9.1" },
  { name: "Argo CD", version: "10.4.0" },
  { name: "Argo Rollouts", version: "2.41.1" },
  { name: "CloudNativePG", version: "0.29.0" },
  { name: "Headlamp", version: "0.44.0" },
  { name: "Keycloak", version: "7.2.2" },
  { name: "Pinniped", version: "v0.47.0" },
  { name: "Mailu", version: "2.7.3" },
  { name: "Trivy", version: "0.36.0" },
  { name: "OpenCost", version: "2.5.30" },
  { name: "oauth2-proxy", version: "10.7.0" },
  { name: "Consul", version: "2.0.3" },
  { name: "Vault", version: "0.34.1" },
  { name: "External Secrets", version: "0.20.4" },
];

export const TEMPLATE_PROFILES: Record<TemplateId, TemplateProfile> = {
  k8s_full: {
    servers: 8,
    technologies: "Kubernetes, etcd, Keepalived, nginx stream",
    summary: "API traffic lands on a Keepalived VIP, then two load balancers, three masters, and three workers.",
    roles: [
      { label: "Load balancers", count: 2 },
      { label: "Masters", count: 3 },
      { label: "Workers", count: 3 },
    ],
    flow: [
      {
        title: "Entry",
        chain: true,
        nodes: [{ label: "Clients" }, { label: "VIP", hint: "Keepalived" }],
      },
      { title: "Balancers", nodes: [{ label: "LB", count: 2, hint: "nginx stream" }] },
      { title: "Control plane", nodes: [{ label: "Masters", count: 3, hint: "API + etcd" }] },
      { title: "Workers", nodes: [{ label: "Workers", count: 3 }] },
    ],
    spec: [
      {
        title: "Platform",
        items: [
          { name: "Kubernetes", version: "1.36.3" },
          { name: "etcd", version: "v3.6.12" },
          { name: "Helm", version: "4.2.1" },
          { name: "Keepalived", version: "distro package" },
          { name: "nginx stream", version: "distro package" },
        ],
      },
      { title: "Addons", items: K8S_ADDONS },
    ],
  },
  infra_edge: {
    servers: 1,
    technologies: "BIND, step-ca, NTP, container registry, nginx mirrors",
    summary: "One infra VM hosts DNS, certificates, time, and the package and image mirrors.",
    roles: [{ label: "Infra platform", count: 1 }],
    flow: [
      { title: "Hypervisor", nodes: [{ label: "Proxmox" }] },
      { title: "Host", nodes: [{ label: "Infra VM", count: 1 }] },
      {
        title: "Services",
        nodes: [
          { label: "BIND" },
          { label: "step-ca" },
          { label: "NTP" },
          { label: "Registry" },
          { label: "nginx mirrors" },
        ],
      },
    ],
    spec: [
      {
        title: "Software",
        items: [
          { name: "BIND", version: "ubuntu/bind9:edge" },
          { name: "step-ca", version: "smallstep/step-ca:latest" },
          { name: "NTP", version: "cturra/ntp:latest" },
          { name: "Registry", version: "3.1.1" },
          { name: "nginx", version: "1.27-alpine" },
        ],
      },
    ],
  },
  pve_templates: {
    servers: 0,
    technologies: "Proxmox, cloud images",
    summary: "Builds golden images on the hypervisor. This leaf declares no guest VMs.",
    roles: [],
    flow: [
      { title: "Hypervisor", nodes: [{ label: "Proxmox" }] },
      {
        title: "Images",
        nodes: [
          { label: "ubuntu-base", hint: "image" },
          { label: "debian-base", hint: "image" },
          { label: "oracle-base", hint: "image" },
        ],
      },
    ],
    spec: [
      {
        title: "Software",
        items: [
          { name: "ubuntu-base", version: "Ubuntu minimal cloud" },
          { name: "oracle-base", version: "Oracle Linux KVM" },
          { name: "debian-base", version: "Debian generic cloud" },
        ],
      },
    ],
  },
  redis: {
    servers: 10,
    technologies: "Redis Cluster, HAProxy, Predixy",
    summary: "Clients hit two HAProxy nodes, then two Predixy proxies, in front of three masters and three replicas.",
    roles: [
      { label: "Load balancers", count: 2 },
      { label: "Proxies", count: 2 },
      { label: "Masters", count: 3 },
      { label: "Replicas", count: 3 },
    ],
    flow: [
      { title: "Clients", nodes: [{ label: "Clients" }] },
      { title: "Balancers", nodes: [{ label: "HAProxy", count: 2 }] },
      { title: "Proxies", nodes: [{ label: "Predixy", count: 2 }] },
      {
        title: "Cluster",
        nodes: [
          { label: "Masters", count: 3 },
          { label: "Replicas", count: 3 },
        ],
      },
    ],
    spec: [
      {
        title: "Software",
        items: [
          { name: "Redis", version: "8.8.0" },
          { name: "Predixy", version: "7.0.1" },
          { name: "HAProxy", version: "6379 / 6380" },
        ],
      },
    ],
  },
  postgresql: {
    servers: 9,
    technologies: "PostgreSQL, Patroni, etcd, HAProxy, Keepalived",
    summary: "Three HAProxy nodes front three Patroni members. A separate etcd trio holds the quorum.",
    roles: [
      { label: "Load balancers", count: 3 },
      { label: "PostgreSQL", count: 3 },
      { label: "etcd", count: 3 },
    ],
    flow: [
      { title: "Clients", nodes: [{ label: "Clients" }] },
      { title: "Balancers", nodes: [{ label: "HAProxy", count: 3 }] },
      {
        title: "Database",
        nodes: [
          { label: "Patroni", count: 3, hint: "PostgreSQL" },
          { label: "etcd", count: 3, hint: "quorum" },
        ],
      },
    ],
    spec: [
      {
        title: "Software",
        items: [
          { name: "PostgreSQL", version: "18" },
          { name: "etcd", version: "v3.7.0" },
          { name: "HAProxy", version: "5432 / 5433" },
        ],
      },
    ],
  },
  kafka: {
    servers: 6,
    technologies: "Kafka KRaft",
    summary: "Three KRaft controllers elect the quorum. Three brokers serve traffic.",
    roles: [
      { label: "Controllers", count: 3 },
      { label: "Brokers", count: 3 },
    ],
    flow: [
      { title: "Quorum", nodes: [{ label: "Controllers", count: 3, hint: "KRaft" }] },
      { title: "Data", link: "both", nodes: [{ label: "Brokers", count: 3 }] },
    ],
    spec: [
      {
        title: "Software",
        items: [
          { name: "Kafka", version: "4.3.1" },
          { name: "Scala", version: "2.13" },
        ],
      },
    ],
  },
  jenkins_agent: {
    servers: 3,
    technologies: "Jenkins inbound agents",
    summary: "Three agent VMs register to a Jenkins controller that lives outside this leaf.",
    roles: [{ label: "Agents", count: 3 }],
    flow: [
      { title: "Controller", nodes: [{ label: "Jenkins", hint: "external" }] },
      { title: "Agents", nodes: [{ label: "Agents", count: 3 }] },
    ],
    spec: [
      {
        title: "Software",
        items: [
          { name: "Jenkins agent", version: "inbound" },
          { name: "Executors per node", version: "5" },
        ],
      },
    ],
  },
  gitlab_runner: {
    servers: 3,
    technologies: "GitLab Runner, shell executor",
    summary: "Three shell runners register to a GitLab instance that lives outside this leaf.",
    roles: [{ label: "Runners", count: 3 }],
    flow: [
      { title: "GitLab", nodes: [{ label: "GitLab", hint: "external" }] },
      { title: "Runners", nodes: [{ label: "Runners", count: 3, hint: "shell" }] },
    ],
    spec: [
      {
        title: "Software",
        items: [
          { name: "GitLab Runner", version: "shell" },
          { name: "Concurrent jobs", version: "4" },
        ],
      },
    ],
  },
};

export function templateProfile(name: string): TemplateProfile | null {
  if ((INIT_TEMPLATES as readonly string[]).includes(name)) {
    return TEMPLATE_PROFILES[name as TemplateId];
  }
  return null;
}

/** Golden-image factory declares no guest hosts, so init should not open the hosts dialog. */
export function templateOpensHostsAfterInit(template: string): boolean {
  const profile = templateProfile(template);
  return profile == null || profile.servers > 0;
}
