import type { Executor } from '@nrwl/devkit';
import { join } from 'node:path';
import type { PackageManager } from '$types';
import { logger, getFlavor, getFlavorValue, execute } from '$utils';
import { readFile } from 'fs/promises';

interface EmulateOptions {
	/** Don't log anything */
	silent?: boolean;
	/** Get verbose logs */
	verbose?: boolean;
	flavors: Record<string, string>;
	/** The flavor of the project */
	flavor?: string;

	envFilePath?: string;

	packageManager?: PackageManager;

	project: string;
}

const getEnvironment = (
	value: string,
): 'production' | 'development' | 'preview' => {
	switch (value) {
		case 'production':
		case 'development':
			return value;
		default:
			return 'preview';
	}
};

const readEnvFile = async (filePath: string): Promise<[string, string][]> => {
	try {
		const fileContent = await readFile(filePath, 'utf-8');
		const envVariables = fileContent
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'))
			.map((line) => line.split('='))
			.map(([key, value]) => [key.trim(), value.trim()]);

		return envVariables as [string, string][];
	} catch (error) {
		throw new Error(`Error reading environment file ${filePath}: ${error}`);
	}
};

const executor: Executor<EmulateOptions> = async (options, context) => {
	logger.setLogSeverity(options);
	logger.debug('getBaseOptions', options);

	const { projectName, root: workspaceRoot, workspace } = context;

	if (!projectName) {
		throw new Error('Project name is not defined');
	}
	if (!workspace) {
		throw new Error('Workspace is not defined');
	}
	const relativeProjectPath = workspace.projects[projectName].root;
	const projectRoot = join(workspaceRoot, relativeProjectPath);
	const packageManager = options.packageManager ?? 'pnpm';

	const flavor = getFlavor(options);

	const flavorValue = getFlavorValue({
		flavors: options.flavors,
		flavor,
	});

	const environment = getEnvironment(flavorValue);

	const envFileVariables = await readEnvFile(
		join(projectRoot, `.env.${flavor}`),
	);

	const uploadEnvVariable = async (key: string, value: string) => {
		const commandArguments: string[] = [
			'vercel',
			'env',
			'add',
			'--cwd',
			projectRoot,
			key,
			environment,
		];

		if (environment === 'preview') {
			commandArguments.push(flavorValue);
		}
		try {
			// replace 'add' with 'rm' to remove the variable
			const removeCommandArguments = [...commandArguments];
			removeCommandArguments[2] = 'rm';
			await execute({
				packageManager,
				commandArguments: removeCommandArguments,
				cwd: projectRoot,
				autoPrompt: (data) => {
					logger.debug('autoPrompt', data);
					if (data.includes('Are you sure? [y/N]')) {
						return 'y';
					}
					return undefined;
				},
			});
		} catch (error) {
			if (
				(error as { message: string })?.message?.includes('not found')
			) {
				logger.debug('Variable not found, skipping removal');
			} else {
				logger.error('Error removing variable', error);
			}
		}

		await execute({
			packageManager,
			commandArguments,
			cwd: projectRoot,
			autoPrompt: (data) => {
				if (data.includes(`the value of ${key}?`)) {
					return value;
				}
				return undefined;
			},
		});
	};

	await Promise.all(
		envFileVariables.map(([key, value]) => uploadEnvVariable(key, value)),
	);

	return {
		success: true,
	};
};

export default executor;
