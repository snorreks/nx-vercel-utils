# nx-vercel-utils<!-- omit in toc -->

![npm (nx-vercel-utils)](https://img.shields.io/npm/v/nx-vercel-utils)

-   [Features](#features)
-   [Install](#install)
-   [Description](#description)
-   [Prerequisites](#prerequisites)
-   [Executors](#executors)
    -   [Env](#env)
        -   [Options](#options)
        -   [Examples](#examples)

## Features

-   Upload and replace all environment variables from your `.env` file to vercel

## Install

```bash
pnpm i -D nx-vercel-utils
```

## Description

This plugin adds a `env` executor that will deploy your environment variables to vercel.

## Prerequisites

-   You will need to have the [vercel cli](https://www.npmjs.com/package/vercel) installed. Either globally or locally in your project. If you install it globally you have to set `packageManager` option to `global`.

```bash
pnpm i -D vercel
```

You also need to cd into the project and run `vercel link` to link your project to your vercel account. That will create a .vercel folder.

Example

```
cd apps/frontend
vercel login # if you haven't logged in
vercel link
```

## Executors

### Env

See the example [here](https://github.com/snorreks/nx-vercel-utils/tree/master/example/apps/frontend)

```json
...
	"targets": {
		"deploy-vercel-env": {
			"executor": "../dist:env",
			"options": {
				"flavors": {
					"development": "development",
					"production": "production",
					"staging": "staging"
				},
				"vercelProjectName": "your-vercel-project-name"
			}
		},
```

#### Options

| Option              | Description                                                                                                                                                                                                                                 | Default  | Alias     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| `vercelProjectName` | The name of the vercel project.                                                                                                                                                                                                             | required | `project` |
| `flavors`           | A object of the flavors to use, the key is the flavor name and value is either 'production', 'development', 'preview' or 'preview:{branch}'. Read more [here](https://vercel.com/docs/concepts/projects/environment-variables#environments) | required |           |
| `flavor`            | The flavor to use, default will be the first key in the `flavors` object.                                                                                                                                                                   |          |           |
| `silent`            | Whether to suppress all logs.                                                                                                                                                                                                               | `false`  | `s`       |
| `verbose`           | Whether to run the command with verbose logging.                                                                                                                                                                                            | `false`  | `v`       |
| `packageManager`    | The package manager to use for deploying with firebase-tools. Either: `pnpm`, `npm`, `yarn` or `global`.                                                                                                                                    |
| `concurrency`       | The number of envrioments to deploy in parallel                                                                                                                                                                                             | 10       | `c`       |

#### Examples

```bash
pnpm nx deploy-vercel-env frontend

# will deploy the environment variables for the first flavor in the flavors object
```

```bash
pnpm nx deploy-vercel-env frontend --flavor staging
```
