process.env.NODE_ENV = "test";
process.env.MONGO_URL = "mongodb://127.0.0.1:27017/full_product_api_test";
process.env.SECRET_JWT = "test-only-jwt-secret-with-at-least-32-characters";
process.env.LOG_LEVEL = "silent";
process.env.EMAIL_PROVIDER = "mock";
process.env.APP_URL = "http://localhost:5000";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
