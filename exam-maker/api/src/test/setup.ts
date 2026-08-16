// Test environment setup — runs once before all tests
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production'
process.env.EXAM_DATA_ROOT = `/tmp/exam-maker-test-${process.env.VITEST_WORKER_ID || process.pid}`
