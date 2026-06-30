import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const OBJECT_STORAGE_LOCAL = {
  KEY: 'OBJECT_STORAGE_LOCAL',
  LABEL: 'local',
  SERVICE_URL: 'http://127.0.0.1:5107',
  SPACE_NAME: 'slides',
};

const USERNAME = 'username';
const PASSWORD = 'password';

const CONFIG_DEFAULT = {
  OBJECT_STORAGE_LIST: [OBJECT_STORAGE_LOCAL],
  OBJECT_STORAGE_INDEX: 0,
  BACKEND_PORT: 9405,
  USERNAME: USERNAME,
  PASSWORD: PASSWORD,
  auth: {
    type: 'internal',
    users: [
      {
        username: USERNAME,
        password: PASSWORD,
        permission: 'RW',
      },
    ],
  },
};

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT_DIR = path.resolve(CURRENT_DIR, '..');
const CONFIG_DIR = path.join(PROJECT_ROOT_DIR, 'config');

const normalizeObjectStoragePreset = (entry, fallbackKey = '') => {
  const serviceUrl = `${entry?.SERVICE_URL ?? entry?.serviceUrl ?? ''}`.trim().replace(/\/+$/, '');
  const spaceName = `${entry?.SPACE_NAME ?? entry?.spaceName ?? ''}`.trim();
  const key = `${entry?.KEY ?? entry?.key ?? fallbackKey}`.trim();
  const label = `${entry?.LABEL ?? entry?.label ?? key}`.trim();
  return {
    KEY: key,
    LABEL: label || key,
    SERVICE_URL: serviceUrl,
    SPACE_NAME: spaceName,
  };
};

const loadLocalConfig = async () => {
  try {
    const localConfig = await import('./config.0.js');
    return localConfig ?? {};
  } catch {
    return {};
  }
};

const isPlainObject = (value) => {
  return value && typeof value === 'object' && !Array.isArray(value);
};

const deepMerge = (baseValue, overrideValue) => {
  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const merged = { ...baseValue };
    Object.entries(overrideValue).forEach(([key, value]) => {
      merged[key] = deepMerge(merged[key], value);
    });
    return merged;
  }
  return overrideValue === undefined || overrideValue === null ? baseValue : overrideValue;
};

const loadYamlConfigFile = async (filePath) => {
  try {
    const fileText = await fs.readFile(filePath, 'utf8');
    const config = loadYaml(fileText) ?? {};
    return isPlainObject(config) ? config : {};
  } catch {
    return {};
  }
};

const loadYamlConfig = async () => {
  const exampleConfig = await loadYamlConfigFile(path.join(CONFIG_DIR, 'config.yaml'));
  const localConfig = await loadYamlConfigFile(path.join(CONFIG_DIR, 'config.0.yaml'));
  return deepMerge(exampleConfig, localConfig);
};

const yamlConfig = await loadYamlConfig();
const localConfig = await loadLocalConfig();

const configWithDefault = {
  ...CONFIG_DEFAULT,
  ...yamlConfig,
  ...localConfig,
  auth: deepMerge(deepMerge(CONFIG_DEFAULT.auth, yamlConfig.auth), localConfig.auth),
};

const objectStorageListFromConfig = Array.isArray(configWithDefault.OBJECT_STORAGE_LIST)
  ? configWithDefault.OBJECT_STORAGE_LIST.filter((item) => item && typeof item === 'object')
  : [];

const OBJECT_STORAGE_LIST = (objectStorageListFromConfig.length > 0
  ? objectStorageListFromConfig
  : [...CONFIG_DEFAULT.OBJECT_STORAGE_LIST]
).map((entry, index) => {
  return normalizeObjectStoragePreset(entry, `OBJECT_STORAGE_${index}`);
}).filter((entry) => entry.KEY && entry.SERVICE_URL && entry.SPACE_NAME);

const objectStorageIndexRaw = Number(configWithDefault.OBJECT_STORAGE_INDEX ?? 0);
const isObjectStorageIndexValid = Number.isInteger(objectStorageIndexRaw)
  && objectStorageIndexRaw >= 0
  && objectStorageIndexRaw < OBJECT_STORAGE_LIST.length;
const OBJECT_STORAGE_INDEX = isObjectStorageIndexValid ? objectStorageIndexRaw : 0;

const OBJECT_STORAGE_CURRENT = OBJECT_STORAGE_LIST[OBJECT_STORAGE_INDEX] ?? OBJECT_STORAGE_LIST[0] ?? null;

const BACKEND_PORT = Number.isFinite(Number(configWithDefault.BACKEND_PORT))
  && Number(configWithDefault.BACKEND_PORT) > 0
  ? Number(configWithDefault.BACKEND_PORT)
  : CONFIG_DEFAULT.BACKEND_PORT;

const AUTH_USERNAME = `${configWithDefault.USERNAME ?? ''}`.trim() || USERNAME;
const AUTH_PASSWORD = `${configWithDefault.PASSWORD ?? ''}`.trim() || PASSWORD;
const AUTH_CONFIG = isPlainObject(configWithDefault.auth)
  ? configWithDefault.auth
  : CONFIG_DEFAULT.auth;

const findObjectStoragePresetByKey = (presetKeyRaw = '') => {
  const presetKey = `${presetKeyRaw ?? ''}`.trim();
  if (!presetKey) return null;
  return OBJECT_STORAGE_LIST.find((entry) => entry.KEY === presetKey) ?? null;
};

export {
  OBJECT_STORAGE_LIST,
  OBJECT_STORAGE_INDEX,
  OBJECT_STORAGE_CURRENT,
  BACKEND_PORT,
  AUTH_USERNAME,
  AUTH_PASSWORD,
  AUTH_CONFIG,
  normalizeObjectStoragePreset,
  findObjectStoragePresetByKey,
};
