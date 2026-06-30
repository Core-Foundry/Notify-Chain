/**
 * Template Service
 * 
 * Business logic layer for notification templates
 * Coordinates between repository, validator, and renderer
 */

import { TemplateRepository } from './template-repository';
import { TemplateValidator } from './template-validator';
import { TemplateRenderer } from './template-renderer';
import logger from '../utils/logger';
import {
  CreateTemplateInput,
  UpdateTemplateInput,
  RenderContext,
  RenderedTemplate,
  TemplateValidationResult,
  NotificationTemplate,
  TemplateChannelType,
} from '../types/notification-template';

export class TemplateService {
  constructor(private repository: TemplateRepository) {}

  /**
   * Create a new template with validation
   */
  async createTemplate(input: CreateTemplateInput): Promise<{
    success: boolean;
    templateId?: number;
    validation?: TemplateValidationResult;
    error?: string;
  }> {
    try {
      // Validate unique key format
      const keyValidation = TemplateValidator.validateUniqueKey(input.uniqueKey);
      if (!keyValidation.valid) {
        return {
          success: false,
          error: keyValidation.error,
        };
      }

      // Check if unique key already exists
      const exists = await this.repository.exists(input.uniqueKey);
      if (exists) {
        return {
          success: false,
          error: `Template with unique key '${input.uniqueKey}' already exists`,
        };
      }

      // Validate template content
      const validation = TemplateValidator.validate(
        input.bodyTemplate,
        input.subjectTemplate,
        input.channelType
      );

      if (!validation.isValid) {
        return {
          success: false,
          validation,
          error: 'Template validation failed',
        };
      }

      // Extract variables if not provided
      if (!input.variables) {
        input.variables = validation.detectedVariables || [];
      }

      // Create template
      const templateId = await this.repository.create(input);

      logger.info('Template created successfully', {
        templateId,
        uniqueKey: input.uniqueKey,
      });

      return {
        success: true,
        templateId,
        validation,
      };
    } catch (error) {
      logger.error('Failed to create template', { error, input });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update existing template with re-validation
   */
  async updateTemplate(
    id: number,
    input: UpdateTemplateInput
  ): Promise<{
    success: boolean;
    validation?: TemplateValidationResult;
    error?: string;
  }> {
    try {
      // Get existing template
      const existing = await this.repository.getById(id);
      if (!existing) {
        return {
          success: false,
          error: 'Template not found',
        };
      }

      // Validate if body or subject is being updated
      if (input.bodyTemplate || input.subjectTemplate) {
        const bodyToValidate = input.bodyTemplate || existing.bodyTemplate;
        const subjectToValidate =
          input.subjectTemplate !== undefined ? input.subjectTemplate : existing.subjectTemplate;

        const validation = TemplateValidator.validate(
          bodyToValidate,
          subjectToValidate,
          existing.channelType
        );

        if (!validation.isValid) {
          return {
            success: false,
            validation,
            error: 'Template validation failed',
          };
        }

        // Update variables if body changed
        if (input.bodyTemplate && !input.variables) {
          input.variables = validation.detectedVariables || [];
        }
      }

      // Update template
      const updated = await this.repository.update(id, input);

      if (!updated) {
        return {
          success: false,
          error: 'No changes made or template not found',
        };
      }

      logger.info('Template updated successfully', { id });

      return { success: true };
    } catch (error) {
      logger.error('Failed to update template', { error, id });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Render a template with context data
   */
  async renderTemplate(
    uniqueKeyOrId: string | number,
    context: RenderContext
  ): Promise<{
    success: boolean;
    rendered?: RenderedTemplate;
    error?: string;
    missingVariables?: string[];
  }> {
    try {
      // Get template
      const template =
        typeof uniqueKeyOrId === 'string'
          ? await this.repository.getByUniqueKey(uniqueKeyOrId)
          : await this.repository.getById(uniqueKeyOrId);

      if (!template) {
        return {
          success: false,
          error: 'Template not found',
        };
      }

      if (!template.isActive) {
        return {
          success: false,
          error: 'Template is inactive',
        };
      }

      // Validate context has all required variables
      const contextValidation = TemplateRenderer.validateContext(
        template.variables,
        context,
        template.defaultValues
      );

      if (!contextValidation.valid) {
        return {
          success: false,
          error: 'Missing required variables',
          missingVariables: contextValidation.missing,
        };
      }

      // Render template
      const rendered = TemplateRenderer.renderTemplate(
        template.subjectTemplate,
        template.bodyTemplate,
        context,
        template.defaultValues,
        { htmlEscape: true }
      );

      // Log usage
      await this.repository.logUsage({
        templateId: template.id!,
        renderedAt: new Date(),
        contextData: context,
        status: 'SUCCESS',
      });

      logger.info('Template rendered successfully', {
        templateId: template.id,
        uniqueKey: template.uniqueKey,
      });

      return {
        success: true,
        rendered,
      };
    } catch (error) {
      logger.error('Failed to render template', { error, uniqueKeyOrId });

      // Log failed usage if we have template ID
      if (typeof uniqueKeyOrId === 'number') {
        await this.repository.logUsage({
          templateId: uniqueKeyOrId,
          renderedAt: new Date(),
          contextData: context,
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get template by ID or unique key
   */
  async getTemplate(uniqueKeyOrId: string | number): Promise<NotificationTemplate | null> {
    if (typeof uniqueKeyOrId === 'string') {
      return await this.repository.getByUniqueKey(uniqueKeyOrId);
    }
    return await this.repository.getById(uniqueKeyOrId);
  }

  /**
   * List templates with filters
   */
  async listTemplates(filters?: {
    channelType?: TemplateChannelType;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NotificationTemplate[]> {
    return await this.repository.getAll(filters);
  }

  /**
   * Deactivate template
   */
  async deactivateTemplate(id: number): Promise<boolean> {
    const success = await this.repository.deactivate(id);
    if (success) {
      logger.info('Template deactivated', { id });
    }
    return success;
  }

  /**
   * Delete template permanently
   */
  async deleteTemplate(id: number): Promise<boolean> {
    const success = await this.repository.delete(id);
    if (success) {
      logger.info('Template deleted permanently', { id });
    }
    return success;
  }

  /**
   * Get template usage statistics
   */
  async getTemplateStats(id: number) {
    return await this.repository.getUsageStats(id);
  }

  /**
   * Get overview statistics
   */
  async getOverviewStats() {
    const countByChannel = await this.repository.getCountByChannel();
    const allTemplates = await this.repository.getAll();

    return {
      totalTemplates: allTemplates.length,
      activeTemplates: allTemplates.filter((t) => t.isActive).length,
      inactiveTemplates: allTemplates.filter((t) => !t.isActive).length,
      byChannel: countByChannel,
    };
  }
}
