// Configuration file for SillyTavern Character Generator
const LOCAL_STORAGE_KEY = "charGeneratorConfig";
const SESSION_STORAGE_KEYS = {
  textApiKey: "charGeneratorConfig:textApiKey",
  imageApiKey: "charGeneratorConfig:imageApiKey",
};

class Config {
  constructor() {
    this.config = this.getDefaultConfig();
    this.debugMode = false; // Toggle for verbose logging
    this.loadConfig().catch(console.error);
  }

  getDefaultConfig() {
    return {
      api: {
        text: {
          baseUrl: "",
          apiKey: "",
          model: "",
          timeout: 60000,
        },
        image: {
          baseUrl: "",
          apiKey: "",
          model: "",
          size: "",
          timeout: 60000,
        },
      },
      app: {
        maxRetries: 3,
        retryDelay: 1000,
        debugMode: false,
      },
    };
  }

  // Toggle debug mode for verbose logging
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.config.app.debugMode = enabled;
    this.saveConfig();
    console.log(`Debug mode ${enabled ? "enabled" : "disabled"}`);
  }

  getDebugMode() {
    return this.debugMode || this.config.app.debugMode || false;
  }

  log(...args) {
    if (this.getDebugMode()) {
      console.log(...args);
    }
  }

  async loadConfig() {
    // Load from localStorage
    const savedConfig = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedConfig) {
      try {
        const saved = JSON.parse(savedConfig);
        this.stripPersistedApiKeys(saved);
        this.config = this.deepMerge(this.config, saved);
        this.logRedacted("Loaded config from storage:", saved);
      } catch (error) {
        console.warn("Failed to load saved config:", error);
      }
    }

    this.restoreSensitiveValuesFromSession();

    // Load debug mode setting
    this.debugMode = this.config.app.debugMode || false;

    this.logRedacted("Final config:", this.config);
  }

  loadFromForm() {
    // Load text API settings from form
    const textBaseUrl = document.getElementById("text-api-base")?.value?.trim();
    const textApiKey = document.getElementById("text-api-key")?.value?.trim();
    const textModel = document.getElementById("text-model")?.value?.trim();

    if (textBaseUrl !== undefined) this.config.api.text.baseUrl = textBaseUrl;
    if (textApiKey !== undefined) this.config.api.text.apiKey = textApiKey;
    if (textModel !== undefined) this.config.api.text.model = textModel;

    // No special handling needed when using proxy server

    // Load image API settings from form
    const imageBaseUrl = document
      .getElementById("image-api-base")
      ?.value?.trim();
    const imageApiKey = document.getElementById("image-api-key")?.value?.trim();
    const imageModel = document.getElementById("image-model")?.value?.trim();
    const imageSize = document.getElementById("image-size")?.value?.trim();

    if (imageBaseUrl !== undefined)
      this.config.api.image.baseUrl = imageBaseUrl;
    if (imageApiKey !== undefined) this.config.api.image.apiKey = imageApiKey;
    if (imageModel !== undefined) this.config.api.image.model = imageModel;
    if (imageSize !== undefined) this.config.api.image.size = imageSize;
  }

  get(path) {
    return path.split(".").reduce((obj, key) => obj && obj[key], this.config);
  }

  set(path, value) {
    const keys = path.split(".");
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => {
      if (!obj[key]) obj[key] = {};
      return obj[key];
    }, this.config);
    target[lastKey] = value;
    this.saveConfig();
  }

  saveConfig() {
    const persistableConfig = this.getSanitizedConfigForStorage();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(persistableConfig));
    this.persistSensitiveValuesToSession();
  }

  saveToForm() {
    // Wait for DOM to be ready
    setTimeout(() => {
      // Save text API to form
      const textBaseUrl = document.getElementById("text-api-base");
      const textApiKey = document.getElementById("text-api-key");
      const textModel = document.getElementById("text-model");

      if (textBaseUrl) textBaseUrl.value = this.config.api.text.baseUrl || "";
      if (textApiKey) textApiKey.value = this.config.api.text.apiKey || "";
      if (textModel) textModel.value = this.config.api.text.model || "";

      // Save image API to form
      const imageBaseUrl = document.getElementById("image-api-base");
      const imageApiKey = document.getElementById("image-api-key");
      const imageModel = document.getElementById("image-model");
      const imageSize = document.getElementById("image-size");

      if (imageBaseUrl)
        imageBaseUrl.value = this.config.api.image.baseUrl || "";
      if (imageApiKey) imageApiKey.value = this.config.api.image.apiKey || "";
      if (imageModel) imageModel.value = this.config.api.image.model || "";
      if (imageSize) imageSize.value = this.config.api.image.size || "";
    }, 100);
  }

  deepMerge(target, source) {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return item && typeof item === "object" && !Array.isArray(item);
  }

  async waitForConfig() {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return this.config;
  }

  validateConfig() {
    const errors = [];

    // Text API validation
    if (!this.config.api.text.baseUrl) {
      errors.push("Text API base URL is required");
    }
    if (!this.config.api.text.apiKey) {
      errors.push("Text API key is required");
    }
    if (!this.config.api.text.model) {
      errors.push("Text model is required");
    }

    return errors;
  }

  getSanitizedConfigForStorage() {
    const configCopy = JSON.parse(JSON.stringify(this.config));
    if (configCopy.api?.text) {
      configCopy.api.text.apiKey = "";
    }
    if (configCopy.api?.image) {
      configCopy.api.image.apiKey = "";
    }
    return configCopy;
  }

  persistSensitiveValuesToSession() {
    this.persistSessionValue(
      SESSION_STORAGE_KEYS.textApiKey,
      this.config.api.text.apiKey,
    );
    this.persistSessionValue(
      SESSION_STORAGE_KEYS.imageApiKey,
      this.config.api.image.apiKey,
    );
  }

  persistSessionValue(key, value) {
    try {
      if (value) {
        sessionStorage.setItem(key, value);
      } else {
        sessionStorage.removeItem(key);
      }
    } catch (error) {
      console.warn("Unable to persist sensitive config to sessionStorage:", error);
    }
  }

  restoreSensitiveValuesFromSession() {
    const textKey = this.getSessionValue(SESSION_STORAGE_KEYS.textApiKey);
    if (textKey !== null) {
      this.config.api.text.apiKey = textKey;
    }
    const imageKey = this.getSessionValue(SESSION_STORAGE_KEYS.imageApiKey);
    if (imageKey !== null) {
      this.config.api.image.apiKey = imageKey;
    }
  }

  getSessionValue(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.warn("Unable to read sensitive config from sessionStorage:", error);
      return null;
    }
  }

  stripPersistedApiKeys(savedConfig) {
    if (!this.isObject(savedConfig)) {
      return;
    }

    if (savedConfig?.api?.text?.apiKey) {
      console.warn(
        "Discarded persisted text API key. Keys are now stored only for the current session.",
      );
      savedConfig.api.text.apiKey = "";
    }

    if (savedConfig?.api?.image?.apiKey) {
      console.warn(
        "Discarded persisted image API key. Keys are now stored only for the current session.",
      );
      savedConfig.api.image.apiKey = "";
    }
  }

  clearStoredConfig() {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    Object.values(SESSION_STORAGE_KEYS).forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {
        console.warn("Unable to clear sessionStorage for sensitive config:", error);
      }
    });
  }

  redactSensitiveData(data) {
    if (Array.isArray(data)) {
      return data.map((item) => this.redactSensitiveData(item));
    }

    if (!this.isObject(data)) {
      return data;
    }

    const redacted = {};
    Object.keys(data).forEach((key) => {
      if (key.toLowerCase().includes("apikey")) {
        redacted[key] = data[key] ? "[REDACTED]" : "";
      } else {
        redacted[key] = this.redactSensitiveData(data[key]);
      }
    });
    return redacted;
  }

  logRedacted(message, data) {
    if (this.getDebugMode()) {
      console.log(message, this.redactSensitiveData(data));
    }
  }
}

// Export singleton instance
window.config = new Config();
