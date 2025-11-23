import React, { useState, useEffect, useRef } from 'react'

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg=='

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  onRefreshUrl?: () => void | Promise<void>; // Callback to refresh expired S3 URLs
  maxRetries?: number; // Maximum number of retry attempts
}

export function ImageWithFallback(props: ImageWithFallbackProps) {
  const { onRefreshUrl, maxRetries = 1, ...imgProps } = props;
  const [didError, setDidError] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | undefined>(props.src)
  const retryCountRef = useRef(0)
  const isRetryingRef = useRef(false)
  const corsErrorDetectedRef = useRef(false) // Track if CORS error was detected

  // Reset error state when src changes
  useEffect(() => {
    // Don't reset CORS error flag if we've already detected a CORS error
    // This prevents infinite loops when refreshUrl generates new URLs that also fail with CORS
    if (!corsErrorDetectedRef.current) {
      setDidError(false)
      setImageSrc(props.src)
      retryCountRef.current = 0
      isRetryingRef.current = false
    } else {
      // If CORS error was detected, only update the src but keep error state and CORS flag
      setImageSrc(props.src)
      // Keep didError true and corsErrorDetectedRef true to prevent retries
    }
  }, [props.src])

  const handleError = async (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.target as HTMLImageElement;
    const isS3Url = img.currentSrc?.includes('s3.') || img.currentSrc?.includes('amazonaws.com');
    
    // Detect CORS error - if image fails with 0 dimensions and it's an S3 URL, it's likely CORS
    const isCorsError = isS3Url && img.naturalWidth === 0 && img.naturalHeight === 0;
    
    // If CORS error detected, don't retry - it won't help
    if (isCorsError) {
      corsErrorDetectedRef.current = true;
    }
    
    // Only log error if it's not a retry attempt
    if (!isRetryingRef.current) {
      const errorInfo: any = {
        src: props.src,
        currentSrc: img.currentSrc,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        isS3Url,
        isCorsError,
      };
      
      if (isCorsError) {
        // Check if this is a logo (likely old S3 logo that needs migration)
        const isLogo = img.currentSrc?.includes('branding') || img.currentSrc?.includes('logo');
        
        if (isLogo) {
          errorInfo.helpMessage = 'Old S3 logo detected. Logos are now stored in Supabase. Please re-upload the logo in Settings to migrate to Supabase storage.';
          console.error('🔴 Old S3 Logo Detected:', errorInfo.helpMessage);
          console.error('📋 MIGRATION STEPS:');
          console.error('   1. Go to Settings → Branding');
          console.error('   2. Re-upload your logo (it will be saved to Supabase)');
          console.error('   3. The new logo will be secured and use Supabase storage');
          console.warn('ImageWithFallback: Old S3 logo detected - please migrate to Supabase by re-uploading in Settings.');
        } else {
          errorInfo.helpMessage = 'CORS error detected. Configure CORS on your S3 bucket. See docs/S3_CORS_SETUP.md';
          console.error('🔴 CORS Configuration Required:', errorInfo.helpMessage);
          console.error('📋 QUICK FIX STEPS:');
          console.error('   1. Go to AWS S3 Console → Your bucket (mana-smart-scent-files)');
          console.error('   2. Click "Permissions" tab → "Cross-origin resource sharing (CORS)" → "Edit"');
          console.error('   3. Paste the CORS configuration from docs/S3_CORS_SETUP.md');
          console.error('   4. Save changes and wait 1-2 minutes');
          console.error('   5. Clear browser cache and refresh');
          console.warn('ImageWithFallback: CORS error - will not retry. Fix CORS configuration on S3 bucket.');
        }
      } else {
        console.warn('ImageWithFallback: Failed to load image', errorInfo);
      }
    }

    // Don't retry if CORS error is detected - refreshing URL won't help
    // Set error immediately and return to prevent infinite loop
    if (isCorsError || corsErrorDetectedRef.current) {
      corsErrorDetectedRef.current = true;
      setDidError(true);
      isRetryingRef.current = false;
      return; // Exit immediately - don't retry on CORS errors
    }

    // Try to refresh S3 URL if it's an S3 URL and we have a refresh callback
    // Only retry if it's NOT a CORS error and we haven't exceeded max retries
    if (isS3Url && onRefreshUrl && retryCountRef.current < maxRetries) {
      isRetryingRef.current = true;
      retryCountRef.current += 1;
      
      try {
        // Call the refresh callback to get a new URL
        await onRefreshUrl();
        // Wait a bit for the URL to update, then reset error state
        setTimeout(() => {
          setDidError(false);
          isRetryingRef.current = false;
        }, 500);
        return; // Don't set error state yet, wait for refresh
      } catch (refreshError) {
        console.error('ImageWithFallback: Failed to refresh URL:', refreshError);
        isRetryingRef.current = false;
      }
    }

    // If no refresh callback or max retries reached, show error
    setDidError(true)
    isRetryingRef.current = false
  }

  const { src, alt, style, className, ...rest } = imgProps

  // If no src, show placeholder
  if (!src) {
    return (
      <div
        className={`inline-block bg-gray-100 text-center align-middle ${className ?? ''}`}
        style={style}
      >
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-xs text-gray-400">No image</div>
        </div>
      </div>
    )
  }

  return didError ? (
    <div
      className={`inline-block bg-gray-100 text-center align-middle relative ${className ?? ''}`}
      style={style}
    >
      <div className="flex items-center justify-center w-full h-full">
        <img src={ERROR_IMG_SRC} alt="Error loading image" {...rest} data-original-url={src} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-red-500 bg-white px-1 rounded" title={src}>
            Failed to load
          </span>
        </div>
      </div>
    </div>
  ) : (
    <img 
      src={imageSrc || src} 
      alt={alt} 
      className={className} 
      style={style} 
      {...rest} 
      onError={handleError}
      crossOrigin="anonymous"
      loading="lazy"
    />
  )
}
