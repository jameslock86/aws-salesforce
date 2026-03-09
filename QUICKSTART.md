# Quickstart

## 1) Set DB password env var (required)
```bash
export TF_VAR_db_password="REPLACE_WITH_A_STRONG_PASSWORD"
```

## 2) Build lambda zip
```bash
./scripts/build-lambda.sh
```

## 3) Deploy
```bash
cd infra
terraform init
terraform apply
```

## 4) Test
Terraform outputs `api_base_url`. Example:

```bash
export API_BASE_URL="$(terraform output -raw api_base_url)"
curl -s "$API_BASE_URL/" | jq
curl -s -X POST "$API_BASE_URL/items" -H "Content-Type: application/json" -d '{"name":"hello"}' | jq
curl -s "$API_BASE_URL/upload-url?key=test.txt&contentType=text/plain" | jq
```

## 5) Destroy
```bash
terraform destroy
```
