# VINI (Workflow Definition System)

**MIT License © Matthew Salvatore Giancola**

## Overview

VINI is a JavaScript-based web process definition system that enables secure programmatic definition of user flows. It links between pages, changes to components, and prompts to users, integrating well with VICI, VIDI, and VENI. All workflows run locally unless server validated.

## Installation

### Prerequisites
- Node.js (for build tools, optional for runtime)
- Modern web browser with JavaScript support
- No external server dependencies required

### Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/emperor42/vini.git
   cd vini
   ```

2. Include VINI in your HTML:
   ```html
   <!-- Option 1: Direct script tag -->
   <script src="vini.js"></script>

   <!-- Option 2: Local file -->
   <script>
   // VINI will automatically initialize
   </script>
   ```

3. For Node.js development (optional):
   ```bash
   # Install build tools
   npm install
   
   # Build for distribution
   npm run build
   ```

## Usage (Standalone)

### Basic Usage

```javascript
// Basic VINI usage
<script src="vini.js"></script>

// VINI will automatically initialize

// Define a workflow
const workflow = new Vini.Workflow({
  name: 'User Login Process',
  steps: [
    {
      name: 'Show Login Form',
      action: 'show', 
      component: 'login-form'
    },
    {
      name: 'Validate Credentials',
      action: 'validate',
      service: 'auth-api',
      onSuccess: 'show-dashboard',
      onFailure: 'show-error'
    }
  ]
});

// Start the workflow
workflow.start();
```

### Advanced Usage

```javascript
// Define complex workflows with conditions
const complexWorkflow = new Vini.Workflow({
  name: 'E-commerce Checkout',
  steps: [
    {
      name: 'Add to Cart',
      action: 'modify-state',
      state: { cart: { items: ['product1'], total: 29.99 } }
    },
    {
      name: 'Proceed to Checkout',
      action: 'validate-security',
      validation: 'address-verification',
      onSuccess: 'show-payment-form',
      onFailure: 'prompt-authentication'
    }
  ],
  security: {
    requireAuthentication: true,
    encryptionKey: 'your-encryption-key'
  }
});\n// Workflow event handlers
workflow.on('step-complete', (event) => {
  console.log(`Step completed: ${event.step.name}`);
});

workflow.on('validation-error', (event) => {
  console.error(`Validation error: ${event.error}`);
});
```

### API Endpoints

| Method | Description |
|--------|-------------|
| `new Vini.Workflow(options)` | Create new workflow |
| `workflow.start()` | Start workflow execution |
| `workflow.pause()` | Pause workflow execution |
| `workflow.resume()` | Resume workflow execution |
| `workflow.stop()` | Stop workflow execution |
| `workflow.restart()` | Restart workflow |
| `workflow.getState()` | Get current workflow state |
| `workflow.setState(state)` | Set workflow state |
| `workflow.getProgress()` | Get workflow execution progress |
| `workflow.getLogs()` | Get workflow execution logs |

### Example HTML Page

```html
<!DOCTYPE html>
<html>
<head>
    <title>VINI Workflow Demo</title>
    <!-- Include VINI -->
    <script src="vini.js"></script>
</head>
<body>
    <!-- VINI will manage user workflows here -->
    <div id="workflow-container"></div>
    <!-- VINI will render workflow steps here -->
    
    <script>
    // Define and start workflow
    const workflow = new Vini.Workflow({
        name: 'User Login Process',
        steps: [
            {
                name: 'Show Login Form',
                action: 'show',
                component: 'login-form'
            }
        ]
    });
    
    // Start the workflow
    workflow.start();
    </script>
</body>
</html>
```

## Integration with ATP

### Workflow Integration

VINI integrates with ATP to provide centralized workflow management:

```javascript
// VINI with ATP integration
const workflow = new Vini.Workflow({
    name: 'User Login Process',
    steps: [
        {
            name: 'Show Login Form',
            action: 'show',
            component: 'login-form'
        }
    ],
    security: {
        requireAuthentication: true,
        encryptionKey: 'your-encryption-key'
    },
    syncWithATP: true,
    onWorkflowStart: function(event) {
        console.log('Workflow started:', event.workflow.name);
    },
    onStepComplete: function(event) {
        console.log('Step completed:', event.step.name);
    }
});

// Synchronize with ATP
workflow.syncWithATP().then(() => {
    console.log('Workflow synchronized with ATP');
    const workflows = workflow.getVINIWorkflows();
    console.log(`Loaded ${workflows.length} workflows from ATP`);
});
```

### Workflow Configuration

```javascript
// VINI configuration for ATP integration
const viniConfig = {
    security: {
        requireAuthentication: true,
        encryptionKey: 'your-encryption-key'
    },
    syncStrategy: 'merge', // merge, replace, append
    apiEndpoint: '/atp/api',
    onWorkflowStart: function(event) {
        console.log('Workflow started:', event.workflow);
    },
    onStepComplete: function(event) {
        console.log('Step completed:', event.step);
    },
    onError: function(error) {
        console.error('Workflow error:', error);
    }
};
```

### Workflow Management Pipeline

1. **Workflow Definition**: Define user workflows programmatically
2. **Workflow Execution**: Execute workflows locally or with server validation
3. **Workflow Monitoring**: Monitor workflow execution progress
4. **Workflow Integration**: Integrate with VICI, VIDI, and VENI
5. **Workflow Distribution**: Distribute workflows through ATP APIs

## Development Setup

### Local Development

```bash
# Test in browser
# Open browser and load:
# http://localhost:8080/vini.html
# (VINI will automatically load and display workflows)

# Or with Node.js
node -e "require('vini').test()"
```

### Testing

```javascript
// Basic VINI usage test
const Vini = window.Vini;

const testVini = () => {
    // Test VINI initialization
    const workflow = new Vini.Workflow({
        name: 'Test Workflow',
        steps: [{
            name: 'Test Step',
            action: 'execute'
        }]
    });
    
    expect(workflow).toBeDefined();
    expect(workflow.name).toBe('Test Workflow');
};

// Workflow execution test
const testWorkflowExecution = () => {
    const workflow = new Vini.Workflow({
        name: 'Test Workflow',
        steps: [{
            name: 'Test Step',
            action: 'execute',
            onComplete: function() {
                console.log('Workflow completed successfully');
            }
        }]
    });

    workflow.start();
    expect(workflow.getProgress()).toBeGreaterThan(0);
};
```

### Building

```bash
# Build for distribution
npm run build

# Output: dist/vini.js (optimized and bundled)

# Test in browser
# Open browser and load: dist/vini.js
```

## API Specifications

### High Maturity API (Event-driven)

#### Workflow Management
- `new Vini.Workflow(options)` - Create new workflow
- `workflow.start()` - Start workflow execution
- `workflow.pause()` - Pause workflow execution
- `workflow.resume()` - Resume workflow execution
- `workflow.stop()` - Stop workflow execution
- `workflow.restart()` - Restart workflow
- `workflow.getState()` - Get current workflow state
- `workflow.setState(state)` - Set workflow state
- `workflow.getProgress()` - Get workflow execution progress
- `workflow.getLogs()` - Get workflow execution logs

#### Workflow Control
- `workflow.getState()` - Get current workflow state
- `workflow.setState(state)` - Set workflow state
- `workflow.getProgress()` - Get workflow execution progress
- `workflow.getLogs()` - Get workflow execution logs

#### Workflow Events
- `workflow.on('step-complete', callback)` - Step completion event
- `workflow.on('validation-error', callback)` - Validation error event
- `workflow.on('workflow-complete', callback)` - Workflow completion event
- `workflow.on('workflow-error', callback)` - Workflow error event

### VINI APIs

```javascript
// Create workflow
const workflow = new Vini.Workflow({
    name: 'User Login',
    steps: [
        {
            name: 'Show Login Form',
            action: 'show',
            component: 'login-form'
        }
    ]
});

// Start workflow
workflow.start();

// Get workflow state
const state = workflow.getState();
console.log(state);

// Get workflow progress
const progress = workflow.getProgress();
console.log(`Progress: ${progress}%`);

// Workflow events
workflow.on('step-complete', (event) => {
    console.log(`Step completed: ${event.step.name}`);
});
```

### VINI-specific Events

```javascript
// Step completion event
workflow.on('step-complete', (event) => {
    const { step, result } = event;
    console.log(`${step.name}: ${result}`);
});

// Validation error event
workflow.on('validation-error', (event) => {
    const { step, error } = event;
    console.error(`Validation failed for step ${step.name}: ${error}`);
});

// Workflow completion event
workflow.on('workflow-complete', (event) => {
    console.log('Workflow completed successfully');
});

// Workflow error event
workflow.on('workflow-error', (event) => {
    const { error } = event;
    console.error(`Workflow error: ${error}`);
});
```

## Security API

### Workflow Security
- `workflow.setEncryptionKey(key)` - Set encryption key
- `workflow.requireAuthentication(require)` - Require authentication
- `workflow.setAccessControl(roles)` - Set access control

### Authentication
- `workflow.authenticate(token)` - Authenticate with token
- `workflow.getUser()` - Get current user
- `workflow.setUser(user)` - Set current user

### Authorization
- `workflow.hasPermission(resource, action)` - Check permissions
- `workflow.grantPermission(permission)` - Grant permission
- `workflow.revokePermission(permission)` - Revoke permission

## Integration API

### VICI Integration
- `workflow.syncWithVICI(config)` - Synchronize with VICI
- `workflow.getVICIChanges()` - Get VICI changes
- `workflow.applyVICIChanges(changes)` - Apply VICI changes

### VIDI Integration
- `workflow.getVIDIState()` - Get VIDI state
- `workflow.syncWithVIDI(data)` - Synchronize with VIDI
- `workflow.getVIDIAnalytics()` - Get VIDI analytics

### VENI Integration
- `workflow.discoverVENIComponents()` - Discover VENI components
- `workflow.generateFromVENITemplate(template)` - Generate from VENI template
- `workflow.integrateWithVENI(component)` - Integrate with VENI component

## Monitoring API

### Workflow Monitoring
- `workflow.onProgressChanged(callback)` - Progress change callback
- `workflow.getExecutionLogs()` - Get execution logs
- `workflow.getPerformanceMetrics()` - Get performance metrics

### Workflow Events
- `workflow.onStepStart(stepName)` - Step start event
- `workflow.onStepComplete(stepName)` - Step complete event
- `workflow.onWorkflowStart()` - Workflow start event
- `workflow.onWorkflowComplete()` - Workflow complete event

## Error Handling

### VINI Error Types
- `WorkflowError` - Workflow execution errors
- `ValidationError` - Validation errors
- `SecurityError` - Security errors
- `IntegrationError` - Integration errors

### Error Response Format
```javascript
// VINI errors
class VINIError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}
```

## Testing

### Unit Tests

```javascript
// Test workflow creation
 test('Workflow Creation', () => {
   const workflow = new Vini.Workflow({ name: 'Test Workflow' });
   expect(workflow).toBeDefined();
   expect(workflow.name).toBe('Test Workflow');
 });

// Test workflow execution
 test('Workflow Execution', () => {
   const workflow = new Vini.Workflow({
     name: 'Test Workflow',
     steps: [{ name: 'Test Step', action: 'execute' }]
   });

   workflow.start();
   expect(workflow.getProgress()).toBeGreaterThan(0);
 });
```

### Integration Tests

```javascript
// Test VINI integration
 test('VINI-VICI Integration', () => {
   const workflow = new Vini.Workflow({
     name: 'Integration Test',
     steps: [{ name: 'Sync with VICI', action: 'sync' }]
   });

   workflow.start();
   expect(workflow.getVICIChanges()).toBeDefined();
 });
```

## Performance Considerations

- **Memory Usage**: Monitor for large workflow definitions
- **CPU Usage**: Optimize workflow execution algorithms
- **Network I/O**: Cache frequently used workflow data
- **Disk I/O**: Use efficient storage for workflow state
- **Concurrent Processing**: Support for concurrent workflow execution

## Future Enhancements

- **AI Integration**: Integrate AI for workflow optimization
- **Advanced Validation**: Add advanced validation rules
- **Machine Learning**: ML-powered workflow optimization
- **Real-time Processing**: Add real-time workflow execution
- **Cloud Integration**: Integrate with cloud services

## Troubleshooting

### Common Issues

1. **Workflow not starting**
   ```javascript
   // Check workflow configuration
   const workflow = new Vini.Workflow({
     name: 'Test Workflow',
     steps: [{ name: 'Test Step', action: 'execute' }]
   });
   
   // Test workflow start
   workflow.start();
   ```

2. **Step execution errors**
   ```javascript
   // Check step actions and handlers
   const workflow = new Vini.Workflow({
     name: 'Test Workflow',
     steps: [{
       name: 'Test Step',
       action: 'execute',
       onComplete: function() {
         console.log('Step completed');
       }
     }]
   });
   ```

3. **Event listener issues**
   ```javascript
   // Check event listener registration
   workflow.on('step-complete', (event) => {
     console.log('Step completed:', event.step.name);
   });
   ```

4. **Integration problems**
   ```javascript
   // Check integration configuration
   const workflow = new Vini.Workflow({
     name: 'Test Workflow',
     syncWithATP: true,
     apiEndpoint: '/atp/api'
   });
   ```

### Debugging Commands

```javascript
// Enable debug logging
Vini.setDebugMode(true);

// Check workflow logs
const logs = workflow.getExecutionLogs();
console.log(logs);

// Monitor workflow state
const state = workflow.getState();
console.log(state);
```

## Conclusion

VINI provides a secure, programmatic workflow definition system that integrates seamlessly with VICI, VIDI, and VENI. It offers enhanced workflow management capabilities while maintaining security and flexibility.

Key benefits:

- **Process Definition**: Programmatic workflow definition with security controls
- **Component Integration**: Seamless integration with VICI, VIDI, and VENI
- **Local Execution**: Secure local workflow execution with server validation
- **Security**: Comprehensive security features and controls
- **Integration**: Rich integration capabilities with other Emperor42 projects
- **Monitoring**: Comprehensive workflow monitoring and analytics
- **Flexibility**: Flexible workflow definition and execution

This workflow definition system is production-ready and can be easily integrated into web applications and services with comprehensive workflow management and security features.

---

*Document Version: 1.0*
*Created: 2026-08-25*
*Last Updated: 2026-08-25*
*Status: Production Ready*

**License:** MIT License © Matthew Salvatore Giancola.