const sessionCache = new Map();

export const setPreloadedSessionData = (sessionId, data) => {
    sessionCache.set(String(sessionId), data);
};

export const getPreloadedSessionData = (sessionId) => {
    const data = sessionCache.get(String(sessionId));
    return data;
};

export const clearPreloadedSessionData = (sessionId) => {
    if (sessionId) {
        sessionCache.delete(String(sessionId));
    } else {
        sessionCache.clear();
    }
};
