export interface Platforms {
	platform_name: string;
	platform_id: string; // uuid
}

export type PlatformsInsert = Omit<Platforms, 'platform_id'> & { platform_id?: string };

export type PlatformsUpdate = Partial<Platforms> & { platform_id: string };


