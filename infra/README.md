# Infra

AWS CDK IaC for Asksynk backend.

## Target resources

- App Runner: API + SSE
- Lambda: background worker + cron
- SNS + SQS FIFO: pub/sub
- Aurora Postgres serverless
- EventBridge: cron schedule
