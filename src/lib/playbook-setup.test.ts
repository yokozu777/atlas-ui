import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  envScopeLabel,
  generateSetupSecret,
  ianaTimeZones,
  isMissingSetupValue,
  reuseKeysFor,
  secretReuseChoices,
  setupFieldCopyText,
  setupProgressFromValues,
  setupSchemaForVarsFile,
} from "./playbook-setup.ts";

describe("atlas-infra-edge.secrets.yml setup schema", () => {
  it("exposes BIND TSIG and step-ca secrets", () => {
    const schema = setupSchemaForVarsFile("atlas-infra-edge.secrets.yml", "");
    const keys = schema.fields.map((field) => field.key);
    assert.deepEqual(keys, [
      "provision_dns_key_secret",
      "external_dns_tsig_secret",
      "external_dns_istio_tsig_secret",
      "stepca_init_password",
    ]);
    for (const key of keys) {
      const field = schema.fields.find((item) => item.key === key);
      assert.equal(field?.input, "password");
      assert.equal(field?.allowEmpty, undefined);
    }
  });

  it("counts empty TSIG secrets as missing", () => {
    const schema = setupSchemaForVarsFile("atlas-infra-edge.secrets.yml", "");
    const k8s = schema.fields.find(
      (field) => field.key === "external_dns_tsig_secret",
    );
    assert.ok(k8s);
    assert.equal(isMissingSetupValue("", k8s), true);
    assert.equal(isMissingSetupValue("CHANGEME", k8s), true);
    assert.equal(isMissingSetupValue("real-secret", k8s), false);
    const progress = setupProgressFromValues(schema, {
      provision_dns_key_secret: "",
      external_dns_tsig_secret: "",
      external_dns_istio_tsig_secret: "",
      stepca_init_password: "",
    });
    assert.equal(progress.missing, 4);
  });
});

describe("saved secret reuse", () => {
  it("treats apex TSIG keys from compute-provision, infra-edge, and addons as one group", () => {
    const keys = reuseKeysFor("external_dns_apex_tsig_secret");
    assert.deepEqual(keys, [
      "provision_dns_key_secret",
      "external_dns_apex_tsig_secret",
      "k8s_lb_dns_key_secret",
    ]);
    assert.deepEqual(reuseKeysFor("provision_dns_key_secret"), keys);
    assert.deepEqual(reuseKeysFor("k8s_lb_dns_key_secret"), keys);
    const compute = setupSchemaForVarsFile(
      "atlas-compute-provision.secrets.yml",
      "",
    );
    const addons = setupSchemaForVarsFile("atlas-k8s-addons.secrets.yml", "");
    assert.equal(
      compute.fields.some((field) => field.key === "provision_dns_key_secret"),
      true,
    );
    assert.equal(
      addons.fields.some(
        (field) => field.key === "external_dns_apex_tsig_secret",
      ),
      true,
    );
    const choices = secretReuseChoices(
      "external_dns_apex_tsig_secret",
      "build32/k8s",
      [
        {
          key: "provision_dns_key_secret",
          clusterId: "build32/infra",
          file: "group_vars/all/atlas-infra-edge.secrets.yml",
          origin: "leaf",
          value: "same-bytes",
        },
        {
          key: "external_dns_apex_tsig_secret",
          clusterId: "build31/k8s",
          file: "group_vars/all/atlas-k8s-addons.secrets.yml",
          origin: "leaf",
          value: "same-bytes",
        },
        {
          key: "external_dns_apex_tsig_secret",
          clusterId: "build32/k8s",
          file: "group_vars/all/atlas-k8s-addons.secrets.yml",
          origin: "leaf",
          value: "same-bytes",
        },
      ],
    );
    assert.equal(choices.length, 1);
    assert.equal(
      choices[0].label,
      "build31/k8s, build32/infra · Apex zone TSIG / ExternalDNS apex TSIG",
    );
    assert.equal(choices[0].value, "same-bytes");
    assert.equal(choices[0].label.includes("build32/k8s"), false);
  });
});

describe("atlas-infra-edge.yml setup schema", () => {
  it("exposes the cache seed load switch, image, and tag", () => {
    const fields = setupSchemaForVarsFile("atlas-infra-edge.yml", "").fields;
    const load = fields.find((field) => field.key === "infra_cache_seed_load_enabled");
    const image = fields.find((field) => field.key === "infra_cache_seed_load_image");
    const tag = fields.find((field) => field.key === "infra_cache_seed_load_tag");
    const warm = fields.find((field) => field.key === "helm_repo_nginx_cache_warm_enabled");
    assert.equal(load?.valueType, "boolean");
    assert.equal(image?.group, "Cache");
    assert.equal(tag?.group, "Cache");
    assert.equal(warm?.valueType, "boolean");
    assert.equal(warm?.group, "Cache");
    const keys = fields.map((field) => field.key);
    for (const key of [
      "infra_cache_seed_registry_tls_ca_enabled",
      "infra_cache_seed_registry_tls_ca_src",
      "nginx_cache_sync_enabled",
    ]) {
      assert.equal(keys.includes(key), false);
    }
  });
});

describe("timezone field", () => {
  it("offers IANA zones and still stores a typed value", () => {
    for (const file of ["atlas-node-foundation.yml", "atlas-infra-edge.yml"]) {
      const field = setupSchemaForVarsFile(file, "").fields.find(
        (item) => item.key === "timezone",
      );
      assert.equal(field?.valueType, "timezone");
    }
    const zones = ianaTimeZones();
    assert.equal(zones[0], "UTC");
    assert.equal(zones[1], "Europe/Moscow");
    assert.ok(zones.includes("America/New_York"));
  });
});

describe("setup secret helpers", () => {
  it("generates a short keepalived pass and a longer secret", () => {
    const vip = generateSetupSecret("vip_auth_pass");
    const grafana = generateSetupSecret("grafana_admin_password");
    assert.equal(vip.length, 8);
    assert.equal(grafana.length, 32);
    assert.match(vip, /^[A-Za-z0-9]+$/);
    assert.notEqual(generateSetupSecret("grafana_admin_password"), grafana);
  });

  it("copies scalar text and skips an empty value", () => {
    const field = { key: "dns_domain_suffix", label: "DNS domain" };
    assert.equal(setupFieldCopyText(field, "lab.example"), "lab.example");
    assert.equal(setupFieldCopyText(field, "   "), "   ");
    assert.equal(setupFieldCopyText(field, undefined), "");
  });
});

describe("k8s overlay setup schemas", () => {
  const files = [
    "atlas-k8s-core.yml",
    "atlas-k8s-core.secrets.yml",
    "atlas-k8s-addons.yml",
    "atlas-k8s-addons.secrets.yml",
  ];

  it("returns fields for each overlay even when the file text is empty", () => {
    for (const name of files) {
      const schema = setupSchemaForVarsFile(name, "");
      assert.ok(schema.fields.length > 0, name);
    }
  });

  it("marks core and addons secrets as passwords", () => {
    const vip = setupSchemaForVarsFile("atlas-k8s-core.secrets.yml", "").fields.find(
      (field) => field.key === "vip_auth_pass",
    );
    const grafana = setupSchemaForVarsFile("atlas-k8s-addons.secrets.yml", "").fields.find(
      (field) => field.key === "grafana_admin_password",
    );
    assert.equal(vip?.input, "password");
    assert.equal(grafana?.input, "password");
    assert.equal(isMissingSetupValue("CHANGEME", vip), true);
    assert.equal(isMissingSetupValue("CHANGEME", grafana), true);
  });

  it("treats optional DNS key and empty helm nginx domain as present", () => {
    const dnsKey = setupSchemaForVarsFile("atlas-k8s-core.secrets.yml", "").fields.find(
      (field) => field.key === "k8s_lb_dns_key_secret",
    );
    const helmDomain = setupSchemaForVarsFile("atlas-k8s-addons.yml", "").fields.find(
      (field) => field.key === "helm_repo_nginx_ingress_domain",
    );
    assert.equal(dnsKey?.allowEmpty, true);
    assert.equal(helmDomain?.allowEmpty, true);
    assert.equal(isMissingSetupValue("", dnsKey), false);
    assert.equal(isMissingSetupValue("", helmDomain), false);
  });

  it("names the environment scope with the env id", () => {
    assert.equal(envScopeLabel("build31/k8s1", "env"), "env/build31");
    assert.equal(envScopeLabel("build31/k8s1", "leaf"), "env/build31");
    assert.equal(envScopeLabel("build31/k8s1", "missing"), "env/build31");
    assert.equal(envScopeLabel("build31/k8s1", "org"), "Default");
  });

  it("exposes the package mirror domain on node foundation", () => {
    const field = setupSchemaForVarsFile("atlas-node-foundation.yml", "").fields.find(
      (item) => item.key === "pkg_repo_nginx_domain",
    );
    assert.equal(field?.label, "Package mirror domain");
    assert.equal(isMissingSetupValue("repo.dev-mxhash.com", field), false);
    assert.equal(isMissingSetupValue("", field), true);
  });

  it("hides inventory groups, ansible user, keepalived NIC, and etcd pin", () => {
    const hidden = [
      "keepalived_interface",
      "ansible_user",
      "k8s_lb_hosts",
      "k8s_master_hosts",
      "k8s_worker_hosts",
      "etcd_version",
      "setup_registry",
      "setup_registry_nginx",
      "nexus_host",
      "harbor_host",
      "pkg_repo_base",
    ];
    for (const name of ["atlas-k8s-core.yml", "atlas-k8s-addons.yml"]) {
      const keys = setupSchemaForVarsFile(name, "").fields.map((field) => field.key);
      for (const key of hidden) {
        if (name === "atlas-k8s-addons.yml" && (key === "keepalived_interface" || key === "k8s_lb_hosts" || key === "etcd_version")) {
          continue;
        }
        assert.equal(keys.includes(key), false, `${name} ${key}`);
      }
    }
  });

  it("offers a registry mode list", () => {
    const field = setupSchemaForVarsFile("atlas-k8s-core.yml", "").fields.find(
      (item) => item.key === "use_internal_docker_registry",
    );
    assert.deepEqual(field?.options, ["none", "registry", "harbor"]);
  });

  it("offers a helm repo mode list", () => {
    const field = setupSchemaForVarsFile("atlas-k8s-addons.yml", "").fields.find(
      (item) => item.key === "use_internal_helm_repo",
    );
    assert.deepEqual(field?.options, ["none", "nginx", "nexus"]);
    const keys = setupSchemaForVarsFile("atlas-k8s-addons.yml", "").fields.map((item) => item.key);
    assert.equal(keys.includes("setup_helm_repo_nginx"), false);
    assert.equal(keys.includes("setup_custom_nginx"), false);
  });

  it("exposes CA root URLs as a string list", () => {
    const ca = setupSchemaForVarsFile("atlas-k8s-core.yml", "").fields.find(
      (field) => field.key === "pki_ca_url",
    );
    assert.equal(ca?.valueType, "string_list");
  });
});
