# PowerShell script to configure CORS on S3 bucket
# Usage: .\scripts\configure-s3-cors.ps1

$BUCKET_NAME = "mana-smart-scent-files"
$REGION = "eu-north-1"
$CORS_CONFIG_FILE = "scripts/s3-cors-config.json"

Write-Host "🔧 Configuring CORS for S3 bucket: $BUCKET_NAME" -ForegroundColor Cyan
Write-Host ""

# Check if AWS CLI is installed
try {
    $awsVersion = aws --version 2>&1
    Write-Host "✅ AWS CLI found: $awsVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ AWS CLI is not installed or not in PATH" -ForegroundColor Red
    Write-Host "   Install AWS CLI from: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Check if CORS config file exists
if (-not (Test-Path $CORS_CONFIG_FILE)) {
    Write-Host "❌ CORS config file not found: $CORS_CONFIG_FILE" -ForegroundColor Red
    Write-Host "   Please ensure the file exists with the CORS configuration." -ForegroundColor Yellow
    exit 1
}

Write-Host "📄 Reading CORS configuration from: $CORS_CONFIG_FILE" -ForegroundColor Cyan

# Apply CORS configuration
Write-Host ""
Write-Host "🚀 Applying CORS configuration to bucket..." -ForegroundColor Cyan
Write-Host ""

try {
    aws s3api put-bucket-cors `
        --bucket $BUCKET_NAME `
        --region $REGION `
        --cors-configuration file://$CORS_CONFIG_FILE
    
    Write-Host ""
    Write-Host "✅ CORS configuration applied successfully!" -ForegroundColor Green
    Write-Host ""
    
    # Verify the configuration
    Write-Host "🔍 Verifying CORS configuration..." -ForegroundColor Cyan
    Write-Host ""
    
    $corsConfig = aws s3api get-bucket-cors --bucket $BUCKET_NAME --region $REGION | ConvertFrom-Json
    
    Write-Host "Current CORS Configuration:" -ForegroundColor Yellow
    Write-Host ($corsConfig | ConvertTo-Json -Depth 10)
    Write-Host ""
    
    Write-Host "✅ CORS configuration verified!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Wait 1-2 minutes for changes to propagate" -ForegroundColor White
    Write-Host "   2. Clear your browser cache or use incognito mode" -ForegroundColor White
    Write-Host "   3. Refresh your application" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Error applying CORS configuration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "   - Make sure AWS credentials are configured (run 'aws configure')" -ForegroundColor White
    Write-Host "   - Verify you have permissions to modify bucket CORS settings" -ForegroundColor White
    Write-Host "   - Check that the bucket name and region are correct" -ForegroundColor White
    Write-Host ""
    exit 1
}

