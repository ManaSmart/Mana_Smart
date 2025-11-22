import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { checkBucketsExist, createBucketsSQL, BUCKET_CONFIGS } from '../lib/storageBucketSetup';

/**
 * Component to check and initialize Supabase storage buckets
 * This helps users verify bucket setup and provides SQL to create missing buckets
 */
export function BucketInitializationChecker() {
	const [checking, setChecking] = useState(false);
	const [bucketStatus, setBucketStatus] = useState<{
		allExist: boolean;
		missing: string[];
		existing: string[];
	} | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		checkBuckets();
	}, []);

	const checkBuckets = async () => {
		setChecking(true);
		try {
			const status = await checkBucketsExist();
			setBucketStatus(status);
		} catch (error) {
			console.error('Error checking buckets:', error);
			toast.error('Failed to check buckets');
		} finally {
			setChecking(false);
		}
	};

	const copySQL = async () => {
		const sql = createBucketsSQL();
		await navigator.clipboard.writeText(sql);
		setCopied(true);
		toast.success('SQL copied to clipboard! Paste it in Supabase SQL Editor.');
		setTimeout(() => setCopied(false), 2000);
	};

	if (checking) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Checking Storage Buckets</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-2">
						<Loader2 className="w-4 h-4 animate-spin" />
						<span>Checking bucket status...</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!bucketStatus) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span>Storage Buckets Status</span>
					<Button variant="outline" size="sm" onClick={checkBuckets}>
						Refresh
					</Button>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{bucketStatus.allExist ? (
					<div className="flex items-center gap-2 text-green-600">
						<CheckCircle2 className="w-5 h-5" />
						<span className="font-semibold">All buckets are set up correctly!</span>
					</div>
				) : (
					<div className="space-y-4">
						<div className="flex items-center gap-2 text-orange-600">
							<XCircle className="w-5 h-5" />
							<span className="font-semibold">
								{bucketStatus.missing.length} bucket(s) missing
							</span>
						</div>

						<div className="space-y-2">
							<h4 className="font-medium">Missing Buckets:</h4>
							<div className="flex flex-wrap gap-2">
								{bucketStatus.missing.map((bucketId) => {
									const config = BUCKET_CONFIGS.find((c) => c.id === bucketId);
									return (
										<Badge key={bucketId} variant="destructive">
											{bucketId} {config && `(${config.name})`}
										</Badge>
									);
								})}
							</div>
						</div>

						<div className="space-y-2">
							<h4 className="font-medium">Existing Buckets:</h4>
							<div className="flex flex-wrap gap-2">
								{bucketStatus.existing.map((bucketId) => {
									const config = BUCKET_CONFIGS.find((c) => c.id === bucketId);
									return (
										<Badge key={bucketId} variant="outline" className="text-green-600">
											{bucketId} {config && `(${config.name})`}
										</Badge>
									);
								})}
							</div>
						</div>

						<div className="border-t pt-4 space-y-2">
							<p className="text-sm text-muted-foreground">
								To create missing buckets, copy the SQL below and run it in Supabase SQL Editor:
							</p>
							<Button onClick={copySQL} variant="outline" className="w-full gap-2">
								{copied ? (
									<>
										<Check className="w-4 h-4" />
										Copied!
									</>
								) : (
									<>
										<Copy className="w-4 h-4" />
										Copy SQL to Create Buckets
									</>
								)}
							</Button>
							<p className="text-xs text-muted-foreground">
								1. Click "Copy SQL" above
								<br />
								2. Go to Supabase Dashboard → SQL Editor
								<br />
								3. Paste and run the SQL
								<br />
								4. Click "Refresh" to verify
							</p>
						</div>
					</div>
				)}

				<div className="border-t pt-4">
					<h4 className="font-medium mb-2">All Required Buckets:</h4>
					<div className="grid grid-cols-2 gap-2 text-sm">
						{BUCKET_CONFIGS.map((config) => {
							const exists = bucketStatus.existing.includes(config.id);
							return (
								<div
									key={config.id}
									className={`flex items-center gap-2 p-2 rounded ${
										exists ? 'bg-green-50' : 'bg-red-50'
									}`}
								>
									{exists ? (
										<CheckCircle2 className="w-4 h-4 text-green-600" />
									) : (
										<XCircle className="w-4 h-4 text-red-600" />
									)}
									<span className={exists ? 'text-green-700' : 'text-red-700'}>
										{config.id}
									</span>
									<Badge variant={config.public ? 'default' : 'secondary'} className="text-xs">
										{config.public ? 'Public' : 'Private'}
									</Badge>
								</div>
							);
						})}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

