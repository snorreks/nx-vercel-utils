import { logger } from '$utils';
import { readFile } from 'fs/promises';
import type { BaseOptions, EnvriomentData } from '..';
import axios from 'axios';

interface EnvData {
	target?: ('production' | 'preview' | 'development')[];
	type?: 'secret' | 'system' | 'encrypted' | 'plain' | 'sensitive';
	id?: string;
	key?: string;
	value?: string;
	configurationId?: string | null;
	createdAt?: number;
	updatedAt?: number;
	createdBy?: string | null;
	updatedBy?: string | null;
	gitBranch?: string;
	edgeConfigId?: string | null;
	edgeConfigTokenId?: string | null;
	contentHint?: {
		type: string;
		storeId: string;
	} | null;
	decrypted?: boolean;
	system?: boolean;
}

type Response =
	| { envs: EnvData[] }
	| EnvData
	| { envs: EnvData[]; pagination: unknown };

const getEnvFromFilePath = async (
	filePath: string,
): Promise<[string, string][]> => {
	try {
		const fileContent = await readFile(filePath, 'utf-8');
		const envVariablePattern =
			/^([^#\s][\w-.]+)\s*=\s*(.*(?:\n(?!\w).*)*)/gm;
		const envVariables: [string, string][] = [];

		let match: RegExpExecArray | null;
		while ((match = envVariablePattern.exec(fileContent)) !== null) {
			const key = match[1].trim();
			const value = match[2].replace(/\\\n/g, '\n').trim();
			// remoe " from the start and end of the value
			if (value.startsWith('"') && value.endsWith('"')) {
				envVariables.push([key, value.slice(1, -1)]);
			} else {
				envVariables.push([key, value]);
			}
		}

		return envVariables;
	} catch (error) {
		logger.error('getLocalEnvironments', error);
		throw new Error(`Error reading environment file ${filePath}: ${error}`);
	}
};

export const getLocalEnvironments = async ({
	localEnvFilePath,
}: BaseOptions): Promise<[string, string][]> => {
	return getEnvFromFilePath(localEnvFilePath);
};

const getOnlineEnvironments = async (
	options: BaseOptions,
): Promise<EnvriomentData[] | undefined> => {
	const { environment, vercelProjectId, vercelToken } = options;

	const response = await axios<Response>({
		url: `https://api.vercel.com/v9/projects/${vercelProjectId}/env?decrypt=true`,
		headers: { Authorization: `Bearer ${vercelToken}` },
		method: 'GET',
	});

	if (response.status !== 200) {
		logger.error(
			'Failed to fetch online environments:',
			response.status,
			response.statusText,
		);
		return;
	}

	const data = response.data;

	logger.log('getOnlineEnvironments:data', data);

	// Check if the 'envs' property exists on the response data and filter based on target
	let envs: EnvriomentData[] = [];
	if ('envs' in data) {
		envs = data.envs
			.filter((env) => env.target?.includes(environment))
			.map(({ id, key, value }) => {
				return {
					id,
					key: key || '',
					value: value || '',
				};
			});
	} else if ('target' in data && data.target?.includes(environment)) {
		envs = [
			{
				id: data.id,
				key: data.key || '',
				value: data.value || '',
			},
		];
	}

	return envs;
};

export const getEnvironmentsToDeploy = async (
	options: BaseOptions,
): Promise<EnvriomentData[]> => {
	try {
		const [localEnvironments, onlineEnvironments] = await Promise.all([
			getLocalEnvironments(options),
			getOnlineEnvironments(options),
		]);
		logger.debug('localEnvironments', localEnvironments);
		logger.debug('onlineEnvironments', onlineEnvironments);
		if (!onlineEnvironments) {
			return localEnvironments.map(([key, value]) => ({
				key,
				value,
			}));
		}

		const environmentsToDeploy: EnvriomentData[] = [];

		for (const localEnvironment of localEnvironments) {
			const [key, value] = localEnvironment;
			const onlineEnvironment = onlineEnvironments.find(
				(onlineKey) => onlineKey.key === key,
			);
			if (!onlineEnvironment) {
				environmentsToDeploy.push({
					key,
					value,
				});
			} else if (onlineEnvironment.value !== value) {
				environmentsToDeploy.push({
					id: onlineEnvironment.id,
					key,
					value,
				});
			}
		}

		if (options.deleteUnusedEnvs) {
			for (const onlineEnvironment of onlineEnvironments) {
				const localEnvironment = localEnvironments.find(
					(localKey) => localKey[0] === onlineEnvironment.key,
				);
				if (!localEnvironment) {
					environmentsToDeploy.push({
						id: onlineEnvironment.id,
						key: onlineEnvironment.key,
						value: onlineEnvironment.value,
						deleteEnv: true,
					});
				}
			}
		}

		logger.debug('environmentsToDeploy', environmentsToDeploy);
		return environmentsToDeploy;
	} catch (error) {
		logger.error('getEnvironmentsToDeploy', error);
		throw error;
	}
};
