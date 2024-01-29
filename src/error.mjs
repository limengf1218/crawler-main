class NoUserError extends Error {
    constructor() {
        super();
    };
};

class NSFWError extends Error {
    constructor() {
        super();
    };
};

class deletedResourceError extends Error {
    constructor(modelId) {
        super();
        this.modelId = modelId;
    }
}

export {
    NoUserError,
    NSFWError,
    deletedResourceError
};