<img width="807" height="371" alt="Screenshot 2026-03-09 at 6 16 37 PM" src="https://github.com/user-attachments/assets/0fb5766e-c296-4f38-a821-d8d7540f176d" />

# API Gateway → Lambda → RDS (+ S3) with Terraform (AWS)

This repo gives you a working reference architecture:

- **API Gateway (HTTP API)** public endpoint
- **Lambda** (in private subnets)
- **RDS MySQL** (private)
- **S3 bucket** (private) + optional presigned upload URL flow
- **VPC** with public/private subnets + NAT Gateway

> Important: API Gateway cannot connect to RDS directly. You always need a compute hop (Lambda/ECS) in between.

---

## What you need installed

1) Terraform (>= 1.6)  
2) AWS CLI v2  
3) Node.js (>= 18, recommended 20) + npm  
4) An AWS account and credentials with permission to create VPC/RDS/Lambda/APIGW/S3/IAM

---

## Step 1 — Configure AWS credentials

Pick one:

### Option A: AWS CLI profile
```bash
aws configure --profile default
```

### Option B: Environment variables
```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"
```

---

## Step 2 — Fill in required values

### A) Set the DB password (required)
Terraform reads `TF_VAR_db_password`. Example:

```bash
export TF_VAR_db_password="REPLACE_WITH_A_STRONG_PASSWORD"
```

You can also put it in `infra/terraform.tfvars` (NOT recommended for real projects).

### B) (Optional) Change region/project name
Edit `infra/variables.tf` (defaults are fine).

---

## Step 3 — Build the Lambda deployment zip

From the repo root:

```bash
./scripts/build-lambda.sh
```

This creates: `lambda/function.zip`

---

## Step 4 — Deploy with Terraform

```bash
cd infra
terraform init
terraform apply
```

At the end, Terraform prints outputs including the API URL.

---

## Step 5 — Test the API



After `terraform apply`, copy `api_base_url` output and run:

### Create an item (writes to RDS)
```bash
curl -s -X POST "$API_BASE_URL/items" \
  -H "Content-Type: application/json" \
  -d '{"name":"hello","notes":"from curl"}' | jq
```

### Get presigned S3 upload URL
```bash
curl -s "$API_BASE_URL/upload-url?key=test.txt&contentType=text/plain" | jq
```

Then upload with the returned URL:
```bash
curl -X PUT -H "Content-Type: text/plain" --data 'hi' "$(jq -r .url response.json)"
```

---

## What this creates (cost warning)

This spins up real AWS resources including **RDS** and **a NAT Gateway**.
Those can cost money if you leave them running.

---

## Tear down

```bash
cd infra
terraform destroy
```

---

## Files you may want to customize

- `infra/variables.tf` — region, project name, DB sizing
- `lambda/index.js` — endpoints and SQL
- `infra/rds.tf` — engine/version/instance size
- `infra/s3.tf` — CORS if you upload from a browser

---

## Troubleshooting

### Lambda can’t reach RDS
- Ensure you ran `./scripts/build-lambda.sh` and re-applied
- Confirm the Lambda is in **private subnets**
- Confirm RDS inbound SG rule allows MySQL (3306) **from Lambda SG**
- If you change VPC resources, run `terraform apply` again

### Browser upload to S3 fails (CORS)
- Add CORS rules in `infra/s3.tf` (commented example included)

### You changed lambda code but nothing updated
- Re-run `./scripts/build-lambda.sh`
- Then `terraform apply` again (Terraform uses the zip hash)

---


Lead.External_DB_ID__c ↔ leads.external_id

Lead.FirstName ↔ leads.first_name

Lead.LastName ↔ leads.last_name

Lead.Company ↔ leads.company

Lead.Title ↔ leads.title

Lead.LeadSource ↔ leads.lead_source

Lead.Status ↔ leads.status

Lead.Description ↔ leads.description

Lead.DB_Updated_At__c ↔ leads.updated_at

Lead.Last_Synced_At__c ↔ (Salesforce-only)

Lead.Sync_Status__c ↔ (Salesforce-only)

Lead.Last_Sync_Error__c ↔ (Salesforce-only)

Account.Name <-> account.name
