export interface MarketingCampaigns {
	last_modified: string | null; // timestamptz
	budget: number;
	performance: any | null; // jsonb
	end_period: string; // date
	start_period: string; // date
	platform: string;
	spent: number | null;
	campaign_name: string;
	campaign_id: string; // uuid
	status: string | null;
}

export type MarketingCampaignsInsert = Omit<MarketingCampaigns, 'campaign_id'> & { campaign_id?: string };

export type MarketingCampaignsUpdate = Partial<MarketingCampaigns> & { campaign_id: string };


