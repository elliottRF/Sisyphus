let cache = {
    template: null,
    exercises: null,
};

export const setPreloadedData = (data) => {
    cache = { ...cache, ...data };
};

export const getPreloadedData = () => {
    return { ...cache };
};

export const clearPreloadedData = () => {
    cache = { template: null, exercises: null };
};
