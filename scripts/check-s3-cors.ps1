# PowerShell script to check CORS configuration on S3 bucket
# Usage: .\scripts\check-s3-cors.ps1

$BUCKET_NAME = "mana-smart-scent-files"
$REGION = "eu-north-1"

Write-Host "🔍 Checking CORS configuration for bucket: $BUCKET_NAME" -ForegroundColor Cyan
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

Write-Host ""

try {
    $corsConfig = aws s3api get-bucket-cors --bucket $BUCKET_NAME --region $REGION 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ CORS is configured!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Current CORS Configuration:" -ForegroundColor Yellow
        Write-Host ($corsConfig | ConvertFrom-Json | ConvertTo-Json -Depth 10)
        Write-Host ""
        
        # Parse and show allowed origins
        $parsed = $corsConfig | ConvertFrom-Json
        if ($parsed.CORSRules -and $parsed.CORSRules.Count -gt 0) {
            $origins = $parsed.CORSRules[0].AllowedOrigins
            Write-Host "Allowed Origins:" -ForegroundColor Cyan
            foreach ($origin in $origins) {
                $isLocalhost = $origin -like "*localhost*"
                if ($isLocalhost) {
                    Write-Host "  ✅ $origin" -ForegroundColor Green
                } else {
                    Write-Host "  ✅ $origin" -ForegroundColor White
                }
            }
            Write-Host ""
            
            # Check if localhost:5173 is included
            $hasLocalhost5173 = $origins -contains "http://localhost:5173"
            if ($hasLocalhost5173) {
                Write-Host "✅ http://localhost:5173 is allowed!" -ForegroundColor Green
            } else {
                Write-Host "⚠️  http://localhost:5173 is NOT in the allowed origins list" -ForegroundColor Yellow
                Write-Host "   You need to add it to fix the CORS error" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "❌ CORS is NOT configured on this bucket" -ForegroundColor Red
        Write-Host ""
        Write-Host "The error message indicates:" -ForegroundColor Yellow
        Write-Host "  $corsConfig" -ForegroundColor White
        Write-Host ""
        Write-Host "💡 To fix this:" -ForegroundColor Cyan
        Write-Host "   1. Run: .\scripts\configure-s3-cors.ps1" -ForegroundColor White
        Write-Host "   2. Or manually configure CORS in AWS Console" -ForegroundColor White
        Write-Host "   3. See docs/S3_CORS_SETUP.md for instructions" -ForegroundColor White
        Write-Host ""
    }
} catch {
    Write-Host "❌ Error checking CORS configuration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Troubleshooting:" -ForegroundColor Yellow
    Write-Host '   - Make sure AWS credentials are configured (run "aws configure")' -ForegroundColor White
    Write-Host "   - Verify you have permissions to read bucket CORS settings" -ForegroundColor White
    Write-Host "   - Check that the bucket name and region are correct" -ForegroundColor White
    Write-Host ""
}

