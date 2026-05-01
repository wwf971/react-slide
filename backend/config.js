const DATABASE_LOCAL = {
  IP: '127.0.0.1',
  PORT: 5432,
  DATABASE_NAME: 'slides',
  USERNAME: 'myuser',
  PASSWORD: 'mypassword',
};

const DATABASE_DEV = {
  IP: '127.0.0.1',
  PORT: 5432,
  DATABASE_NAME: 'slides_dev',
  USERNAME: 'myuser',
  PASSWORD: 'mypassword',
};

const DATABASE_PRODUCTION = {
  IP: '127.0.0.1',
  PORT: 5432,
  DATABASE_NAME: 'slides_production',
  USERNAME: 'myuser',
  PASSWORD: 'mypassword',
};

const loadLocalConfig = async () => {
  try {
    const localConfig = await import('./config.0.js');
    return {
      DATABASE_LOCAL: localConfig.DATABASE_LOCAL ?? {},
      DATABASE_DEV: localConfig.DATABASE_DEV ?? {},
      DATABASE_PRODUCTION: localConfig.DATABASE_PRODUCTION ?? localConfig.DATABASE_PROD ?? {},
    };
  } catch {
    return {
      DATABASE_LOCAL: {},
      DATABASE_DEV: {},
      DATABASE_PRODUCTION: {},
    };
  }
};

const localConfig = await loadLocalConfig();

const DATABASES = {
  DATABASE_LOCAL: {
    ...DATABASE_LOCAL,
    ...localConfig.DATABASE_LOCAL,
  },
  DATABASE_DEV: {
    ...DATABASE_DEV,
    ...localConfig.DATABASE_DEV,
  },
  DATABASE_PRODUCTION: {
    ...DATABASE_PRODUCTION,
    ...localConfig.DATABASE_PRODUCTION,
  },
};

const DATABASE_PRESET_KEY = 'DATABASE_LOCAL';
// const DATABASE_PRESET_KEY = 'DATABASE_DEV';
// const DATABASE_PRESET_KEY = 'DATABASE_PRODUCTION';
const DATABASE = DATABASES[DATABASE_PRESET_KEY];

export { DATABASE, DATABASES, DATABASE_PRESET_KEY };
