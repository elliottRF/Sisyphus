let cache = {
    template: null,
    exercises: null,
};

export const setPreloadedData = (data) => {
    cache = { ...cache, ...data };
};

export const getPreloadedData = () => {
    const data = { ...cache };
    // Clear after reading to ensure freshness
    cache = { template: null, exercises: null };
    return data;
};
