const defaultConfig = {
  DATABASE_IP: '127.0.0.1',
  DATABASE_PORT: 5432,
  DATABASE_NAME: 'slides',
  DATABASE_USERNAME: 'myuser',
  DATABASE_PASSWORD: 'mypassword',
};

const loadLocalConfig = async () => {
  try {
    const localConfig = await import('./config.0.js');
    return {
      DATABASE_IP: localConfig.DATABASE_IP,
      DATABASE_PORT: localConfig.DATABASE_PORT,
      DATABASE_NAME: localConfig.DATABASE_NAME,
      DATABASE_USERNAME: localConfig.DATABASE_USERNAME,
      DATABASE_PASSWORD: localConfig.DATABASE_PASSWORD,
    };
  } catch {
    return {};
  }
};

const loadedConfig = await loadLocalConfig();

const mergedConfig = {
  ...defaultConfig,
  ...loadedConfig,
};

const DATABASE_IP = mergedConfig.DATABASE_IP;
const DATABASE_PORT = mergedConfig.DATABASE_PORT;
const DATABASE_NAME = mergedConfig.DATABASE_NAME;
const DATABASE_USERNAME = mergedConfig.DATABASE_USERNAME;
const DATABASE_PASSWORD = mergedConfig.DATABASE_PASSWORD;

export { DATABASE_IP, DATABASE_PORT, DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD };
