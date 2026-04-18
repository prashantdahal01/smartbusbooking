const TOKEN_KEY = "token";
const USER_KEY = "currentUser";
const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized";

const isBrowser = typeof window !== "undefined";

const getStorages = () => {
  if (!isBrowser) return [];
  return [window.sessionStorage, window.localStorage];
};

const readKey = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const removeKey = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage access issues.
  }
};

const parseStoredUser = (rawUser) => {
  if (!rawUser) return null;

  try {
    const parsed = JSON.parse(rawUser);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const getStoredToken = () => {
  for (const storage of getStorages()) {
    const token = readKey(storage, TOKEN_KEY);
    if (token) return token;
  }

  return "";
};

export const getStoredUser = () => {
  for (const storage of getStorages()) {
    if (!readKey(storage, TOKEN_KEY)) continue;
    return parseStoredUser(readKey(storage, USER_KEY));
  }

  return null;
};

export const getTokenStorageType = () => {
  if (!isBrowser) return "local";
  if (readKey(window.sessionStorage, TOKEN_KEY)) return "session";
  return "local";
};

export const clearAuthSession = () => {
  for (const storage of getStorages()) {
    removeKey(storage, TOKEN_KEY);
    removeKey(storage, USER_KEY);
  }
};

export const persistAuthSession = ({ token, user, persist = true }) => {
  if (!isBrowser) return;

  clearAuthSession();

  const targetStorage = persist ? window.localStorage : window.sessionStorage;
  if (token) targetStorage.setItem(TOKEN_KEY, token);
  if (user) targetStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const emitAuthUnauthorized = () => {
  if (!isBrowser) return;
  window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
};

export const listenForAuthUnauthorized = (handler) => {
  if (!isBrowser) return () => {};

  window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handler);
  return () => {
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handler);
  };
};
