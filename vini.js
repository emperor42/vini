"use strict";

/**
 * vini - Javascript based web process definition system
 * Allows for secure programmatic way to define user-flows
 * Links between pages, changes to components, prompts to user
 * Integrates into VICI, VIDI and VENI well
 * All workflows to be run locally, unless server validated
 * Functionality limits to be set as needed
 * No web server required to work
 * Can be fully embedded in a script tag, hosted in a static page
 */

class Vini {
  constructor(options = {}) {
    this.options = {
      debugMode: options.debugMode || false,
      autoStart: options.autoStart !== false,
      serverEndpoint: options.serverEndpoint || null,
      encryptionKey: options.encryptionKey || null,
      validationSchema: options.validationSchema || null,
      ...options
    };
    this.workflows = new Map();
    this.currentWorkflow = null;
    this.userProgress = new Map();
    this.executionLogs = [];
    this.eventHandlers = {};
    this.initialized = false;
  }

  /**
   * Initialize the workflow system
   */
  init() {
    if (this.initialized) return;
    
    this.initialized = true;
    this.setupEventHandlers();
    this.loadWorkflows();
    
    if (this.options.autoStart && this.workflows.size > 0) {
      const firstWorkflow = this.getWorkflow(this.workflows.keys().next().value);
      this.startWorkflow(firstWorkflow.name);
    }
    
    return this;
  }

  /**
   * Setup event handlers for workflow events
   */
  setupEventHandlers() {
    this.eventHandlers = {
      'workflow-start': [],
      'workflow-continue': [],
      'workflow-complete': [],
      'workflow-pause': [],
      'workflow-resume': [],
      'workflow-end': [],
      'step-complete': [],
      'validation-error': [],
      'server-response': []
    };
    
    // Add global event listeners
    document.addEventListener('vini:start', this.handleStartEvent.bind(this));
    document.addEventListener('vini:continue', this.handleContinueEvent.bind(this));
    document.addEventListener('vini:complete', this.handleCompleteEvent.bind(this));
    document.addEventListener('vini:pause', this.handlePauseEvent.bind(this));
    document.addEventListener('vini:resume', this.handleResumeEvent.bind(this));
    document.addEventListener('vini:end', this.handleEndEvent.bind(this));
    document.addEventListener('vini:step-complete', this.handleStepCompleteEvent.bind(this));
    document.addEventListener('vini:validation-error', this.handleValidationErrorEvent.bind(this));
    document.addEventListener('vini:server-response', this.handleServerResponseEvent.bind(this));
  }

  /**
   * Load workflows from storage or create default
   */
  loadWorkflows() {
    const savedWorkflows = localStorage.getItem('vini_workflows');
    if (savedWorkflows) {
      const decrypted = this.options.encryptionKey ?
        this.decryptData(savedWorkflows) : savedWorkflows;
      const parsed = JSON.parse(decrypted);
      parsed.forEach(workflow =u003e, this.workflows.set(workflow.id, workflow));
    }
    
    // Load user progress
    const savedProgress = localStorage.getItem('vini_user_progress');
    if (savedProgress) {
      const decrypted = this.options.encryptionKey ? 
        this.decryptData(savedProgress) : savedProgress;
      const parsed = JSON.parse(decrypted);
      this.userProgress = new Map(Object.entries(parsed));
    }
  }

  /**
   * Save all data with encryption if configured
   */
  saveData() {
    const workflowsData = JSON.stringify([...this.workflows.values()]);
    const progressData = JSON.stringify(Object.fromEntries(this.userProgress));
    
    const encryptedWorkflows = this.options.encryptionKey ? 
      this.encryptData(workflowsData) : workflowsData;
    const encryptedProgress = this.options.encryptionKey ? 
      this.encryptData(progressData) : progressData;
    
    localStorage.setItem('vini_workflows', encryptedWorkflows);
    localStorage.setItem('vini_user_progress', encryptedProgress);
  }

  /**
   * Create a new workflow
   */
  createWorkflow(name, steps) {
    const id = this.generateId();
    const workflow = {
      id: id,
      name: name,
      steps: steps || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      version: 1,
      metadata: {
        description: '',
        tags: [],
        category: 'general'
      }
    };
    
    this.workflows.set(id, workflow);
    this.saveData();
    this.logExecution('workflow_create', 'system', `Workflow ${name} created`, {workflowId: id, stepCount: workflow.steps.length});
    
    return workflow;
  }

  /**
   * Add a step to a workflow
   */
  addStep(workflowId, step) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow with id ${workflowId} not found`);
    }
    
    const stepId = this.generateId();
    const newStep = {
      id: stepId,
      ...step
    };
    
    workflow.steps.push(newStep);
    workflow.updatedAt = new Date().toISOString();
    workflow.version++;
    
    this.workflows.set(workflowId, workflow);
    this.saveData();
    this.logExecution('step_add', 'system', `Step added to workflow ${workflow.name}`, {workflowId: workflowId, stepId: stepId});
    
    return newStep;
  }

  /**
   * Start a workflow
   */
  startWorkflow(workflowName) {
    const workflow = this.getWorkflowByName(workflowName);
    if (!workflow) {
      throw new Error(`Workflow ${workflowName} not found`);
    }
    
    if (workflow.status !== 'draft') {
      throw new Error(`Workflow ${workflowName} is not in draft status`);
    }
    
    this.currentWorkflow = workflow;
    workflow.status = 'in_progress';
    workflow.startedAt = new Date().toISOString();
    
    const userId = this.getCurrentUserId();
    this.userProgress.set(workflow.id, {
      workflowId: workflow.id,
      stepId: null,
      currentStepIndex: 0,
      progress: {},
      completedSteps: [],
      userId: userId,
      startTime: workflow.startedAt,
      endTime: null,
      status: 'in_progress'
    });
    
    this.workflows.set(workflow.id, workflow);
    this.saveData();
    this.logExecution('workflow_start', 'system', `Workflow ${workflow.name} started`, {workflowId: workflow.id, userId: userId});
    
    // Emit event
    const event = new CustomEvent('vini:workflow-start', {
      detail: {
        workflowId: workflow.id,
        name: workflow.name,
        stepCount: workflow.steps.length,
        userId: userId
      }
    });
    document.dispatchEvent(event);
    
    return this;
  }

  /**
   * Continue workflow
   */
  continueWorkflow() {
    if (!this.currentWorkflow) {
      throw new Error('No workflow is currently active');
    }
    
    this.logExecution('workflow_continue', 'system', `Continuing workflow ${this.currentWorkflow.name}`, {workflowId: this.currentWorkflow.id});
    
    const event = new CustomEvent('vini:workflow-continue', {
      detail: {
        workflowId: this.currentWorkflow.id
      }
    });
    document.dispatchEvent(event);
    
    return this;
  }

  /**
   * Complete a step
   */
  completeStep(stepId, data) {
    if (!this.currentWorkflow) {
      throw new Error('No workflow is currently active');
    }
    
    const workflowProgress = this.userProgress.get(this.currentWorkflow.id);
    const currentStepIndex = workflowProgress?.currentStepIndex;
    
    if (currentStepIndex === null || currentStepIndex === undefined) {
      throw new Error('Workflow progress not found for this workflow');
    }
    
    const currentStep = this.currentWorkflow.steps[currentStepIndex];
    if (!currentStep) {
      throw new Error('No current step found');
    }
    
    // Validate step if validation schema exists
    if (this.options.validationSchema && currentStep.validation) {
      const validationResult = this.validateStepData(stepId, data);
      if (!validationResult.isValid) {
        this.logExecution('validation_error', 'system', `Step ${stepId} validation failed: ${validationResult.errors}`, {
          workflowId: this.currentWorkflow.id,
          stepId: stepId,
          errors: validationResult.errors
        });
        
        const errorEvent = new CustomEvent('vini:validation-error', {
          detail: {
            workflowId: this.currentWorkflow.id,
            stepId: stepId,
            errors: validationResult.errors
          }
        });
        document.dispatchEvent(errorEvent);
        return false;
      }
    }
    
    // Mark step as completed
    const updatedProgress = {
      ...workflowProgress,
      stepId: stepId,
      currentStepIndex: currentStepIndex,
      progress: {
        ...workflowProgress.progress,
        [stepId]: {
          completedAt: new Date().toISOString(),
          data: data,
          validated: true
        }
      },
      completedSteps: [...workflowProgress.completedSteps, stepId],
      // Move to next step if available
      nextStepIndex: currentStepIndex < this.currentWorkflow.steps.length - 1 ? currentStepIndex + 1 : currentStepIndex
    };
    
    this.userProgress.set(this.currentWorkflow.id, updatedProgress);
    this.saveData();
    
    const stepCompleteEvent = new CustomEvent('vini:step-complete', {
      detail: {
        workflowId: this.currentWorkflow.id,
        stepId: stepId,
        data: data,
        stepNumber: currentStepIndex + 1
      }
    });
    document.dispatchEvent(stepCompleteEvent);
    
    this.logExecution('step_complete', 'system', `Step ${stepId} completed in workflow ${this.currentWorkflow.name}`, {
      workflowId: this.currentWorkflow.id,
      stepId: stepId,
      stepNumber: currentStepIndex + 1
    });
    
    return true;
  }

  /**
   * Validate step data against schema
   */
  validateStepData(stepId, data) {
    const workflow = this.getCurrentWorkflow();
    const step = workflow?.steps.find(s => s.id === stepId);
    
    if (!step || !step.validation) {
      return { isValid: true, errors: [] };
    }
    
    const errors = [];
    
    if (step.validation.requiredFields) {
      const missingFields = step.validation.requiredFields.filter(field => 
        data && !(field in data) && (!data[field] || data[field] === '')
      );
      if (missingFields.length > 0) {
        errors.push(`Missing required fields: ${missingFields.join(', ')}`);
      }
    }
    
    if (step.validation.validateWithSchema && this.options.validationSchema) {
      // In a real implementation, you would validate against the schema
      // For simplicity, we'll just do string validation
      if (step.validation.minLength && data && typeof data === 'string') {
        if (data.length < step.validation.minLength) {
          errors.push(`Minimum length is ${step.validation.minLength} characters`);
        }
      }
      
      if (step.validation.maxLength && data && typeof data === 'string') {
        if (data.length > step.validation.maxLength) {
          errors.push(`Maximum length is ${step.validation.maxLength} characters`);
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Pause workflow
   */
  pauseWorkflow() {
    if (!this.currentWorkflow) {
      throw new Error('No workflow is currently active');
    }
    
    const workflowProgress = this.userProgress.get(this.currentWorkflow.id);
    if (!workflowProgress) {
      throw new Error('Workflow progress not found');
    }
    
    const updatedProgress = {
      ...workflowProgress,
      status: 'paused',
      pausedAt: new Date().toISOString()
    };
    
    this.userProgress.set(this.currentWorkflow.id, updatedProgress);
    this.saveData();
    
    this.logExecution('workflow_pause', 'system', `Workflow ${this.currentWorkflow.name} paused`, {workflowId: this.currentWorkflow.id});
    
    const event = new CustomEvent('vini:workflow-pause', {
      detail: {
        workflowId: this.currentWorkflow.id
      }
    });
    document.dispatchEvent(event);
    
    return this;
  }

  /**
   * Resume workflow
   */
  resumeWorkflow() {
    if (!this.currentWorkflow) {
      throw new Error('No workflow is currently active');
    }
    
    const workflowProgress = this.userProgress.get(this.currentWorkflow.id);
    if (!workflowProgress) {
      throw new Error('Workflow progress not found');
    }
    
    const updatedProgress = {
      ...workflowProgress,
      status: 'in_progress',
      pauseDuration: null
    };
    
    this.userProgress.set(this.currentWorkflow.id, updatedProgress);
    this.saveData();
    
    this.logExecution('workflow_resume', 'system', `Workflow ${this.currentWorkflow.name} resumed`, {workflowId: this.currentWorkflow.id});
    
    const event = new CustomEvent('vini:workflow-resume', {
      detail: {
        workflowId: this.currentWorkflow.id
      }
    });
    document.dispatchEvent(event);
    
    return this;
  }

  /**
   * End workflow
   */
  endWorkflow() {
    if (!this.currentWorkflow) {
      throw new Error('No workflow is currently active');
    }
    
    const workflowProgress = this.userProgress.get(this.currentWorkflow.id);
    if (!workflowProgress) {
      throw new Error('Workflow progress not found');
    }
    
    const updatedProgress = {
      ...workflowProgress,
      status: 'completed',
      endTime: new Date().toISOString()
    };
    
    this.userProgress.set(this.currentWorkflow.id, updatedProgress);
    this.saveData();
    
    this.currentWorkflow.status = 'completed';
    this.currentWorkflow.endedAt = new Date().toISOString();
    this.workflows.set(this.currentWorkflow.id, this.currentWorkflow);
    
    this.logExecution('workflow_end', 'system', `Workflow ${this.currentWorkflow.name} completed`, {workflowId: this.currentWorkflow.id});
    
    const event = new CustomEvent('vini:workflow-end', {
      detail: {
        workflowId: this.currentWorkflow.id
      }
    });
    document.dispatchEvent(event);
    
    // Reset current workflow
    this.currentWorkflow = null;
    
    return this;
  }

  /**
   * Add event listener for workflow events
   */
  addEventListener(eventType, handler) {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    
    this.eventHandlers[eventType].push(handler);
  }

  /**
   * Remove event listener
   */
  removeEventListener(eventType, handler) {
    if (this.eventHandlers[eventType]) {
      const index = this.eventHandlers[eventType].indexOf(handler);
      if (index !== -1) {
        this.eventHandlers[eventType].splice(index, 1);
      }
    }
  }

  /**
   * Emit custom event
   */
  emitEvent(eventType, detail) {
    const event = new CustomEvent(eventType, { detail });
    document.dispatchEvent(event);
    
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId) {
    return this.workflows.get(workflowId);
  }

  /**
   * Get workflow by name
   */
  getWorkflowByName(workflowName) {
    for (const workflow of this.workflows.values()) {
      if (workflow.name === workflowName) {
        return workflow;
      }
    }
    return null;
  }

  /**
   * Get all workflows
   */
  getWorkflows() {
    return [...this.workflows.values()];
  }

  /**
   * Get current workflow
   */
  getCurrentWorkflow() {
    return this.currentWorkflow;
  }

  /**
   * Get workflow progress
   */
  getWorkflowProgress(workflowId) {
    return this.userProgress.get(workflowId);
  }

  /**
   * Get all workflows progress for user
   */
  getUserWorkflows(userId) {
    return [...this.userProgress.values()].filter(progress => progress.userId === userId);
  }

  /**
   * Encrypt data with AES
   */
  encryptData(data) {
    if (!this.options.encryptionKey) return data;
    
    try {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);
      const keyData = encoder.encode(this.options.encryptionKey);
      
      const encryptedArray = new Uint8Array(encodedData.length);
      for (let i = 0; i < encodedData.length; i++) {
        encryptedArray[i] = encodedData[i] ^ keyData[i % keyData.length];
      }
      
      return btoa(String.fromCharCode(...encryptedArray));
    } catch (error) {
      console.error('Encryption failed:', error);
      return data;
    }
  }

  /**
   * Decrypt data with AES
   */
  decryptData(encryptedData) {
    if (!this.options.encryptionKey) return encryptedData;
    
    try {
      const encodedArray = new Uint8Array(Array.from(atob(encryptedData), c =u003e, c.charCodeAt(0)));
      const keyData = new TextEncoder().encode(this.options.encryptionKey);
      
      const decryptedArray = new Uint8Array(encodedArray.length);
      for (let i = 0; i < encodedArray.length; i++) {
        decryptedArray[i] = encodedArray[i] ^ keyData[i % keyData.length];
      }
      
      return String.fromCharCode(...decryptedArray);
    } catch (error) {
      console.error('Decryption failed:', error);
      return encryptedData;
    }
  }

  /**
   * Get current user ID
   */
  getCurrentUserId() {
    return 'user-' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Log execution
   */
  logExecution(level, module, message, context) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level,
      module: module,
      message: message,
      context: context,
      userAgent: navigator.userAgent
    };
    
    this.executionLogs.push(logEntry);
    
    if (this.options.debugMode) {
      console.log(`[VINI ${level}] ${logEntry.timestamp} - ${message}`, context || '');
    }
  }

  /**
   * Get execution logs
   */
  getExecutionLogs(filters = {}) {
    let results = this.executionLogs;
    
    if (filters.level) {
      results = results.filter(log => log.level === filters.level);
    }
    
    if (filters.module) {
      results = results.filter(log => log.module === filters.module);
    }
    
    if (filters.startTime) {
      results = results.filter(log => new Date(log.timestamp) >= new Date(filters.startTime));
    }
    
    if (filters.endTime) {
      results = results.filter(log => new Date(log.timestamp) <= new Date(filters.endTime));
    }
    
    return results;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Export workflows to JSON
   */
  exportWorkflows(filename = 'vini_workflows.json') {
    const data = {
      workflows: [...this.workflows.values()],
      userProgress: Object.fromEntries(this.userProgress),
      executionLogs: this.executionLogs
    };
    
    const jsonData = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import workflows from JSON
   */
  importWorkflows(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.workflows) {
        data.workflows.forEach(workflow =u003e, this.workflows.set(workflow.id, workflow));
      }
      
      if (data.userProgress) {
        this.userProgress = new Map(Object.entries(data.userProgress));
      }
      
      if (data.executionLogs) {
        this.executionLogs = [...data.executionLogs];
      }
      
      this.saveData();
      this.logExecution('data_import', 'system', 'Workflows imported successfully', {
        workflowCount: data.workflows?.length || 0,
        progressCount: data.userProgress?.length || 0
      });
    } catch (error) {
      console.error('Failed to import workflows:', error);
      throw error;
    }
  }

  /**
   * Clear all data
   */
  clearData() {
    if (confirm('Are you sure you want to clear all workflows? This cannot be undone.')) {
      this.workflows.clear();
      this.userProgress.clear();
      this.executionLogs = [];
      localStorage.removeItem('vini_workflows');
      localStorage.removeItem('vini_user_progress');
      
      this.logExecution('data_clear', 'system', 'All workflows cleared', {});
    }
  }

  /**
   * Handle start event
   */
  handleStartEvent(event) {
    const { detail } = event;
    this.logExecution('event_start', 'system', 'Start event received', detail);
  }

  /**
   * Handle continue event
   */
  handleContinueEvent(event) {
    const { detail } = event;
    this.logExecution('event_continue', 'system', 'Continue event received', detail);
  }

  /**
   * Handle complete event
   */
  handleCompleteEvent(event) {
    const { detail } = event;
    this.logExecution('event_complete', 'system', 'Complete event received', detail);
  }

  /**
   * Handle pause event
   */
  handlePauseEvent(event) {
    const { detail } = event;
    this.logExecution('event_pause', 'system', 'Pause event received', detail);
  }

  /**
   * Handle resume event
   */
  handleResumeEvent(event) {
    const { detail } = event;
    this.logExecution('event_resume', 'system', 'Resume event received', detail);
  }

  /**
   * Handle end event
   */
  handleEndEvent(event) {
    const { detail } = event;
    this.logExecution('event_end', 'system', 'End event received', detail);
  }

  /**
   * Handle step complete event
   */
  handleStepCompleteEvent(event) {
    const { detail } = event;
    this.logExecution('event_step_complete', 'system', 'Step complete event received', detail);
  }

  /**
   * Handle validation error event
   */
  handleValidationErrorEvent(event) {
    const { detail } = event;
    this.logExecution('event_validation_error', 'system', 'Validation error event received', detail);
  }

  /**
   * Handle server response event
   */
  handleServerResponseEvent(event) {
    const { detail } = event;
    this.logExecution('event_server_response', 'system', 'Server response event received', detail);
  }
}

/**
 * Initialize vini when DOM is ready
 */
const vini = new Vini({
  autoStart: false,
  debugMode: false,
  serverEndpoint: null,
  encryptionKey: null,
  validationSchema: null
});

// Global configuration function
const configureVini = (options) => {
  Object.assign(vini.options, options);
  vini.init();
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    vini.init();
  });
} else {
  vini.init();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Vini };
}

if (typeof window !== 'undefined') {
  window.vini = { Vini, vini, configureVini };
}
