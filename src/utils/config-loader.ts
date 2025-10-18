import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { SourceConfiguration } from '@/domain/source-config';
import { logger } from './logger';

export class ConfigLoader {
    private static instance: ConfigLoader;
    private config: SourceConfiguration | null = null;

    private constructor() {}

    static getInstance(): ConfigLoader {
        if (!ConfigLoader.instance) {
            ConfigLoader.instance = new ConfigLoader();
        }
        return ConfigLoader.instance;
    }

    loadConfig(configPath?: string): SourceConfiguration {
        if (this.config) {
            return this.config;
        }

        const finalPath = configPath || path.join(__dirname, '../../config/sources.yaml');

        try {
            const fileContents = fs.readFileSync(finalPath, 'utf8');
            const rawConfig = yaml.load(fileContents) as SourceConfiguration;

            // Replace environment variables in email config
            this.config = {
                ...rawConfig,
                email: {
                    ...rawConfig.email,
                    to_address: this.resolveEnvVar(rawConfig.email.to_address),
                    from_address: this.resolveEnvVar(rawConfig.email.from_address),
                },
            };

            logger.info('Configuration loaded successfully', {
                path: finalPath,
                topicCount: this.config.topics.length,
            });

            return this.config;
        } catch (error) {
            logger.error('Failed to load configuration', { error, path: finalPath });
            throw new Error(`Failed to load configuration from ${finalPath}`);
        }
    }

    private resolveEnvVar(value: string): string {
        const envVarPattern = /\$\{([^}]+)\}/g;
        return value.replace(envVarPattern, (match, envVarName) => {
            const envValue = process.env[envVarName];
            if (!envValue) {
                logger.warn(`Environment variable ${envVarName} is not set, using placeholder`);
                return match;
            }
            return envValue;
        });
    }

    getConfig(): SourceConfiguration {
        if (!this.config) {
            return this.loadConfig();
        }
        return this.config;
    }
}
