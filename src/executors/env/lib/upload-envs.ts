import { logger } from '$utils';
import axios from 'axios';
import type { BaseOptions, EnvriomentData } from '..';

const handleError = (error: any) => {
	if (error.response) {
		console.error(error.response.data);
		console.error(error.response.status);
		console.error(error.response.headers);
	} else if (error.request) {
		console.error(error.request);
	} else {
		console.error('Error', error.message);
	}
	throw error;
};

const getBaseOptions = (options: {
	vercelToken: string;
	vercelProjectId: string;
	envId?: string;
}) => {
	const { vercelToken, vercelProjectId, envId } = options;
	let url = `https://api.vercel.com/v9/projects/${vercelProjectId}/env`;
	if (envId) {
		url += `/${envId}`;
	}
	return {
		url,
		headers: { Authorization: `Bearer ${vercelToken}` },
	};
};

const deleteEnvVariable = async (
	options: BaseOptions & { key: string; envId: string },
) => {
	try {
		const { key } = options;
		logger.debug('deleteEnvVariable', options);

		const response = await axios({
			...getBaseOptions(options),
			method: 'delete',
		});

		if (response.status !== 200) {
			throw new Error(`Error deleting environment variable ${key}`);
		}
	} catch (error) {
		handleError(error);
	}
};

const addEnvVariable = async (
	options: BaseOptions & { key: string; value: string },
) => {
	const { value, key, environment, githubBranch } = options;
	logger.debug('addEnvVariable', options);

	try {
		const response = await axios({
			...getBaseOptions(options),
			method: 'post',
			data: {
				key,
				value: value,
				type: 'plain',
				target: [environment],
				gitBranch: githubBranch,
			},
		});

		if (response.status !== 200) {
			throw new Error(`Error adding environment variable ${key}`);
		}
	} catch (error) {
		handleError(error);
	}
};

const editEnvVariable = async (
	options: BaseOptions & { key: string; value: string; envId: string },
) => {
	const { value, key, githubBranch, environment } = options;
	logger.debug('addEnvVariable', options);

	try {
		const response = await axios({
			...getBaseOptions(options),
			method: 'patch',
			data: {
				gitBranch: githubBranch,
				key,
				value,
				target: environment,
			},
		});

		if (response.status !== 200) {
			throw new Error(`Error editing environment variable ${key}`);
		}
	} catch (error) {
		handleError(error);
	}
};

export const manageEnvironmentVariableInVercel = async (
	options: BaseOptions,
	{ key, value, id, deleteEnv }: EnvriomentData,
): Promise<void> => {
	if (id) {
		return deleteEnv
			? deleteEnvVariable({ ...options, key, envId: id })
			: editEnvVariable({ ...options, key, value, envId: id });
	}

	return addEnvVariable({ ...options, key, value });
};
