const sessionCache = new Map();

export const setPreloadedSessionData = (sessionId, data) => {
    console.log(`[SessionCache] Setting data for session: ${sessionId} (${data?.length || 0} sets)`);
    sessionCache.set(String(sessionId), data);
};

export const getPreloadedSessionData = (sessionId) => {
    const data = sessionCache.get(String(sessionId));
    console.log(`[SessionCache] Retrieving data for session: ${sessionId} - Found: ${!!data}`);
    return data;
};

export const clearPreloadedSessionData = (sessionId) => {
    if (sessionId) {
        console.log(`[SessionCache] Clearing data for session: ${sessionId}`);
        sessionCache.delete(String(sessionId));
    } else {
        console.log(`[SessionCache] Clearing ALL data`);
        sessionCache.clear();
    }
};
