# GitHub Actions Setup Guide

This guide walks through setting up automated deployment to AWS using GitHub Actions.

## Prerequisites

1. AWS Account with permissions to:
   - Create/manage Lambda functions
   - Create/manage CloudFormation stacks
   - Create/manage IAM roles
   - Create/manage EventBridge rules
   - Send emails via SES

2. GitHub repository: `me2resh/me2resh-daily`

3. OpenAI API key

## Step 1: Set up AWS OIDC Provider (One-time setup)

GitHub Actions uses OIDC to authenticate with AWS without storing long-lived credentials.

### 1.1 Create OIDC Provider in AWS

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 1.2 Create IAM Role for GitHub Actions

Create a file `github-actions-trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:me2resh/me2resh-daily:*"
        }
      }
    }
  ]
}
```

Replace `YOUR_AWS_ACCOUNT_ID` with your actual AWS account ID.

Create the IAM role:

```bash
aws iam create-role \
  --role-name GitHubActions-Me2reshDaily \
  --assume-role-policy-document file://github-actions-trust-policy.json
```

### 1.3 Attach Permissions to the Role

Create a file `github-actions-permissions.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:PassRole",
        "iam:GetRolePolicy",
        "s3:CreateBucket",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "events:*",
        "ses:SendEmail",
        "ses:SendRawEmail",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "application-autoscaling:*",
        "apigateway:*",
        "dynamodb:*",
        "resource-groups:*",
        "applicationinsights:*",
        "tag:GetResources"
      ],
      "Resource": "*"
    }
  ]
}
```

Attach the policy:

```bash
aws iam put-role-policy \
  --role-name GitHubActions-Me2reshDaily \
  --policy-name Me2reshDailyDeploymentPolicy \
  --policy-document file://github-actions-permissions.json
```

### 1.4 Get the Role ARN

```bash
aws iam get-role --role-name GitHubActions-Me2reshDaily --query 'Role.Arn' --output text
```

Save this ARN - you'll need it for GitHub secrets.

## Step 2: Verify SES Email Addresses

Verify the email addresses you'll use:

```bash
# Verify sender email
aws ses verify-email-identity --email-address your-sender@example.com

# Verify recipient email
aws ses verify-email-identity --email-address ahmed.abdelaliem@gmail.com
```

Check verification status:

```bash
aws ses get-identity-verification-attributes \
  --identities ahmed.abdelaliem@gmail.com your-sender@example.com
```

**Note**: If your SES is in sandbox mode, you must verify both sender and recipient emails.

## Step 3: Configure GitHub Secrets

Go to your GitHub repository: `https://github.com/me2resh/me2resh-daily/settings/secrets/actions`

### Add Repository Secrets:

| Secret Name | Value | Example |
|-------------|-------|---------|
| `AWS_ROLE_ARN` | IAM Role ARN from Step 1.4 | `arn:aws:iam::123456789012:role/GitHubActions-Me2reshDaily` |
| `TO_EMAIL_ADDRESS` | Recipient email | `ahmed.abdelaliem@gmail.com` |
| `FROM_EMAIL_ADDRESS` | Verified SES sender email | `sender@yourdomain.com` |
| `OPENAI_API_KEY` | Your OpenAI API key | `sk-proj-...` |
| `SCHEDULE_EXPRESSION` | (Optional) Cron expression | `cron(0 5 * * ? *)` |

### To add secrets via GitHub CLI:

```bash
gh secret set AWS_ROLE_ARN --body "arn:aws:iam::123456789012:role/GitHubActions-Me2reshDaily"
gh secret set TO_EMAIL_ADDRESS --body "ahmed.abdelaliem@gmail.com"
gh secret set FROM_EMAIL_ADDRESS --body "your-verified@email.com"
gh secret set OPENAI_API_KEY --body "sk-proj-your-key-here"
```

## Step 4: Create GitHub Environment (Optional but Recommended)

1. Go to `https://github.com/me2resh/me2resh-daily/settings/environments`
2. Click "New environment"
3. Name it `dev`
4. (Optional) Add protection rules:
   - Required reviewers
   - Wait timer
   - Deployment branches (only `main`)

## Step 5: Test the Deployment

### Trigger deployment by pushing to main:

```bash
git add .
git commit -m "Add GitHub Actions deployment workflow"
git push origin main
```

### Or manually trigger the workflow:

1. Go to `https://github.com/me2resh/me2resh-daily/actions`
2. Select "Deploy to Dev"
3. Click "Run workflow"
4. Select branch `main`
5. Click "Run workflow"

## Step 6: Monitor Deployment

Watch the deployment progress:

```bash
# Via GitHub CLI
gh run watch

# Or visit in browser
open https://github.com/me2resh/me2resh-daily/actions
```

## Step 7: Verify Deployment in AWS

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name me2resh-daily-dev \
  --region eu-west-2

# Check Lambda function
aws lambda get-function \
  --function-name $(aws cloudformation describe-stacks \
    --stack-name me2resh-daily-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`DailyScanFunction`].OutputValue' \
    --output text) \
  --region eu-west-2

# View Lambda logs
aws logs tail /aws/lambda/me2resh-daily-dev-DailyScanFunction --follow
```

## Troubleshooting

### Issue: "Error: User is not authorized to perform: sts:AssumeRoleWithWebIdentity"

**Solution**: Check that:
1. OIDC provider is created
2. Trust policy includes correct repository name
3. Role ARN in GitHub secrets is correct

### Issue: "Email not sending"

**Solution**:
1. Verify both sender and recipient emails in SES
2. Check if SES is in sandbox mode (limits who can receive)
3. Review Lambda CloudWatch logs for errors

### Issue: "OpenAI API errors"

**Solution**:
1. Verify API key is correct
2. Check OpenAI account has available credits
3. Review rate limits on your OpenAI account

### Issue: SAM build fails

**Solution**:
1. Check Node.js version matches (18.x)
2. Run `npm install` locally first to verify dependencies
3. Check for TypeScript compilation errors

## Future: Adding Staging and Production

When ready to add staging/production environments:

1. Create new workflows:
   - `.github/workflows/deploy-staging.yml` (trigger on tags like `v*-rc*`)
   - `.github/workflows/deploy-production.yml` (trigger on release tags like `v*`)

2. Create corresponding GitHub environments with protection rules

3. Use different stack names:
   - Dev: `me2resh-daily-dev`
   - Staging: `me2resh-daily-staging`
   - Production: `me2resh-daily-prod`

4. Consider using different AWS accounts for production isolation

## Cost Monitoring

Set up AWS Budget alerts:

```bash
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

Expected costs:
- Dev environment: ~$3-6/month
- With staging/prod: ~$9-18/month total

## Security Best Practices

1. ✅ Using OIDC instead of long-lived AWS credentials
2. ✅ Secrets marked as `NoEcho` in CloudFormation
3. ✅ Least privilege IAM permissions
4. ✅ Protected GitHub environments
5. 🔄 Consider: AWS Secrets Manager for OpenAI API key (instead of env var)
6. 🔄 Consider: Separate AWS accounts for prod

## Support

For issues:
- Check GitHub Actions logs
- Review CloudWatch Logs in AWS
- Open issue at https://github.com/me2resh/me2resh-daily/issues
