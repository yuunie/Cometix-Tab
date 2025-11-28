use zed_extension_api::{self as zed, settings::LspSettings, LanguageServerId, Result};
use std::fs;

/// Cometix Tab Extension
/// Provides AI code completion via Cursor API through LSP
struct CometixExtension {
    cached_binary_path: Option<String>,
}

impl CometixExtension {
    fn new() -> Self {
        Self {
            cached_binary_path: None,
        }
    }

    /// Get the path to the LSP server binary
    fn language_server_binary_path(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<String> {
        // Check if we have a cached path
        if let Some(path) = &self.cached_binary_path {
            if fs::metadata(path).map(|m| m.is_file()).unwrap_or(false) {
                return Ok(path.clone());
            }
        }

        // Try to find Node.js
        let node_path = worktree
            .which("node")
            .ok_or_else(|| "Node.js not found. Please install Node.js to use Cometix Tab.".to_string())?;

        // Download and extract the LSP server if needed
        let server_path = self.ensure_server_installed(language_server_id)?;
        
        self.cached_binary_path = Some(server_path.clone());
        Ok(server_path)
    }

    /// Ensure the LSP server is installed
    fn ensure_server_installed(&self, language_server_id: &LanguageServerId) -> Result<String> {
        let extension_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?;
        
        let server_dir = extension_dir.join("lsp-server");
        let server_script = server_dir.join("dist").join("index.js");
        
        // Check if server is already installed
        if server_script.exists() {
            return Ok(server_script.to_string_lossy().to_string());
        }
        
        // For development, use the local server
        // In production, this would download from GitHub releases
        Err("LSP server not found. Please build the server first: cd lsp-server && npm install && npm run build".to_string())
    }
}

impl zed::Extension for CometixExtension {
    fn new() -> Self {
        Self::new()
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // Get Node.js path
        let node_path = worktree
            .which("node")
            .ok_or_else(|| "Node.js not found".to_string())?;

        // Get server script path
        let server_path = self.language_server_binary_path(language_server_id, worktree)?;

        // Get settings from Zed
        let settings = LspSettings::for_worktree(language_server_id.as_ref(), worktree)
            .ok()
            .and_then(|s| s.settings);

        // Build environment variables for configuration
        let mut env = vec![];
        
        if let Some(settings) = settings {
            if let Some(auth_token) = settings.get("authToken").and_then(|v| v.as_str()) {
                env.push(("COMETIX_AUTH_TOKEN".to_string(), auth_token.to_string()));
            }
            if let Some(server_url) = settings.get("serverUrl").and_then(|v| v.as_str()) {
                env.push(("COMETIX_SERVER_URL".to_string(), server_url.to_string()));
            }
            if let Some(client_key) = settings.get("clientKey").and_then(|v| v.as_str()) {
                env.push(("COMETIX_CLIENT_KEY".to_string(), client_key.to_string()));
            }
        }

        Ok(zed::Command {
            command: node_path,
            args: vec![server_path, "--stdio".to_string()],
            env,
        })
    }

    fn language_server_initialization_options(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        let settings = LspSettings::for_worktree(language_server_id.as_ref(), worktree)
            .ok()
            .and_then(|s| s.initialization_options);
        
        Ok(settings)
    }

    fn label_for_completion(
        &self,
        _language_server_id: &LanguageServerId,
        completion: zed::lsp::Completion,
    ) -> Option<zed::CodeLabel> {
        // Add a special icon/label for AI completions
        let label = completion.label.clone();
        
        Some(zed::CodeLabel {
            code: format!("✨ {}", label),
            spans: vec![],
            filter_range: (0..label.len()).into(),
        })
    }
}

zed::register_extension!(CometixExtension);
