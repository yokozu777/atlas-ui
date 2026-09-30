import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  envScopeLabel,
  generateSetupSecret,
  generateSetupSecrets,
  ianaTimeZones,
  isMissingSetupValue,
  normalizePveTemplatesMap,
  reuseKeysFor,
  secretReuseChoices,
  setupFieldCopyText,
  setupFieldInvalidMessage,
  setupProgressFromValues,
  setupSchemaForVarsFile,
  setupSearchHits,
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
    assert.equal(isMissingSetupValue("CHANGEME", k8s), false);
    assert.equal(isMissingSetupValue("example.com", k8s), false);
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

  it("generates every password field in a secrets file", () => {
    const schema = setupSchemaForVarsFile("atlas-k8s-addons.secrets.yml", "");
    const generated = generateSetupSecrets(schema.fields);
    const passwords = schema.fields.filter((field) => field.input === "password");
    assert.ok(passwords.length > 1);
    assert.deepEqual(Object.keys(generated).sort(), passwords.map((field) => field.key).sort());
    for (const [key, value] of Object.entries(generated)) {
      assert.equal(value.length, key === "vip_auth_pass" ? 8 : 32);
    }
    const again = generateSetupSecrets(schema.fields);
    assert.notEqual(again.grafana_admin_password, generated.grafana_admin_password);
    const vars = setupSchemaForVarsFile("atlas-k8s-addons.yml", "");
    assert.deepEqual(generateSetupSecrets(vars.fields), {});
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
    const openbaoOidc = setupSchemaForVarsFile("atlas-k8s-addons.secrets.yml", "").fields.find(
      (field) => field.key === "openbao_oidc_client_secret",
    );
    const openbaoAdmin = setupSchemaForVarsFile("atlas-k8s-addons.secrets.yml", "").fields.find(
      (field) => field.key === "openbao_admin_password",
    );
    assert.equal(vip?.input, "password");
    assert.equal(grafana?.input, "password");
    assert.equal(openbaoOidc?.input, "password");
    assert.equal(openbaoOidc?.group, "OIDC");
    assert.equal(openbaoAdmin?.input, "password");
    assert.equal(openbaoAdmin?.group, "OpenBao");
    assert.equal(isMissingSetupValue("CHANGEME", vip), false);
    assert.equal(isMissingSetupValue("CHANGEME", grafana), false);
    assert.equal(
      isMissingSetupValue("CHANGEME_openbao_oidc_client_secret_32b", openbaoOidc),
      false,
    );
    const domain = setupSchemaForVarsFile("atlas-compute-provision.yml", "").fields.find(
      (field) => field.key === "dns_domain_suffix",
    );
    assert.equal(isMissingSetupValue("example.com", domain), false);
    assert.equal(isMissingSetupValue("", domain), true);
    assert.equal(isMissingSetupValue("real-openbao-secret", openbaoOidc), false);
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

  it("exposes DNS servers on node foundation", () => {
    const field = setupSchemaForVarsFile("atlas-node-foundation.yml", "").fields.find(
      (item) => item.key === "dns_servers",
    );
    assert.equal(field?.label, "DNS servers");
    assert.equal(field?.valueType, "string_list");
    assert.equal(field?.itemValueType, "ipv4");
    assert.equal(isMissingSetupValue("", field), true);
    assert.equal(isMissingSetupValue("192.168.1.218", field), false);
    assert.equal(
      setupFieldInvalidMessage(field!, "192.168.1.218\nexample.com"),
      "Invalid IPv4 address",
    );
  });

  it("exposes the BIND address on compute-provision and k8s-core", () => {
    for (const file of ["atlas-compute-provision.yml", "atlas-k8s-core.yml"]) {
      const field = setupSchemaForVarsFile(file, "").fields.find(
        (item) => item.key === "dns_server_ip",
      );
      assert.equal(field?.label, "DNS server IP");
      assert.equal(field?.valueType, "ipv4");
      assert.equal(isMissingSetupValue("", field), true);
      assert.equal(isMissingSetupValue("192.168.1.218", field), false);
    }
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

describe("golden PVE template backup URL", () => {
  it("reads an optional backup and ignores an empty one", () => {
    const map = normalizePveTemplatesMap({
      "ubuntu-base": {
        id: "400100",
        image_url: "https://example.com/u.img",
        image_url_backup: "https://mirror.example/u.img",
      },
      "oracle-base": {
        id: "400101",
        image_url: "https://example.com/o.qcow2",
      },
    });
    assert.equal(map["ubuntu-base"].image_url_backup, "https://mirror.example/u.img");
    assert.equal(map["oracle-base"].image_url_backup, "");
    assert.equal(map["debian-base"].image_url_backup, "");
    const field = {
      key: "provision_pve_templates",
      label: "Golden PVE templates",
      kind: "pve_templates" as const,
    };
    assert.equal(setupFieldInvalidMessage(field, map), null);
    const bad = {
      ...map,
      "debian-base": { ...map["debian-base"], image_url_backup: "not-a-url" },
    };
    assert.equal(setupFieldInvalidMessage(field, bad), "Invalid URL");
  });
});

describe("setup search across files", () => {
  it("matches a value in every file, not only the open one", () => {
    const hits = setupSearchHits(
      [
        {
          name: "atlas-compute-provision.yml",
          path: "group_vars/all/atlas-compute-provision.yml",
          keys: { dns_server_ip: { value: "192.168.1.218" } },
        },
        {
          name: "atlas-k8s-core.yml",
          path: "group_vars/all/atlas-k8s-core.yml",
          keys: { dns_server_ip: { value: "192.168.1.218" } },
        },
        {
          name: "atlas-k8s-addons.yml",
          path: "group_vars/all/atlas-k8s-addons.yml",
          keys: { openbao_host: { value: "openbao.example.com" } },
        },
      ],
      "192.168.1.218",
    );
    assert.deepEqual(
      hits.map((hit) => [hit.fileName, hit.field.key]),
      [
        ["atlas-compute-provision.yml", "dns_server_ip"],
        ["atlas-k8s-core.yml", "dns_server_ip"],
      ],
    );
  });

  it("uses the unsaved value of the open file", () => {
    const hits = setupSearchHits(
      [
        {
          name: "atlas-compute-provision.yml",
          path: "group_vars/all/atlas-compute-provision.yml",
          keys: { dns_server_ip: { value: "10.0.0.1" } },
        },
      ],
      "192.168.1.218",
      {
        overrides: {
          "group_vars/all/atlas-compute-provision.yml": {
            values: { dns_server_ip: "192.168.1.218" },
          },
        },
      },
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.value, "192.168.1.218");
  });
});
