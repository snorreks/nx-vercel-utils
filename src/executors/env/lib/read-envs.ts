import { execute, logger } from '$utils';
import { readFile } from 'fs/promises';
import type { BaseOptions, EnvriomentData } from '..';
import { join } from 'node:path';

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

export const getOnlineEnvironments = async (
	options: BaseOptions,
): Promise<[string, string][] | undefined> => {
	try {
		const {
			projectRoot,
			packageManager,
			environment,
			githubBranch,
			temporaryDirectory,
		} = options;

		const onlineEnvFilePath = join(temporaryDirectory, '.env');

		const commandArguments: string[] = [
			'vercel',
			'env',
			'pull',
			onlineEnvFilePath,
			'--environment',
			environment,
		];

		if (githubBranch) {
			commandArguments.push('--git-branch', githubBranch);
		}

		commandArguments.push(
			'--cwd',
			projectRoot,
			'--local-config',
			join(temporaryDirectory, 'vercel.json'),
		);

		await execute({
			packageManager,
			commandArguments,
			cwd: projectRoot,
		});

		return getEnvFromFilePath(onlineEnvFilePath);
	} catch (error) {
		logger.error('getOnlineEnvironments', error);
		return;
	}
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
				isNew: false,
			}));
		}

		const environmentsToDeploy: EnvriomentData[] = [];

		for (const localEnvironment of localEnvironments) {
			const [key, value] = localEnvironment;
			const onlineEnvironment = onlineEnvironments.find(
				([onlineKey]) => onlineKey === key,
			);
			if (!onlineEnvironment) {
				environmentsToDeploy.push({
					key,
					value,
					isNew: true,
				});
			} else if (onlineEnvironment[1] !== value) {
				environmentsToDeploy.push({
					key,
					value,
					isNew: false,
				});
			}
		}
		logger.debug('environmentsToDeploy', environmentsToDeploy);
		return environmentsToDeploy;
	} catch (error) {
		logger.error('getEnvironmentsToDeploy', error);
		throw error;
	}
};
