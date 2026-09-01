const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

(async () => {
  try {
    const prompts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'ai-prompts.json'), 'utf8'));
    for (const [key, config] of Object.entries(prompts)) {
      const agentType = key === 'learningReport' ? 'report' : key === 'chat' ? 'companion' : key;
      await pool.query(
        `INSERT INTO ai_prompt_versions (agent_type, version, status, config, change_note, created_by)
         VALUES (?, 'v1', 'tested', ?, '从本地 Prompt 配置导入', 0)
         ON DUPLICATE KEY UPDATE config = VALUES(config), status = IF(status = 'published', status, 'tested')`,
        [agentType, JSON.stringify(config)]
      );
      await pool.query(
        `INSERT INTO ai_prompt_deployments (agent_type, prompt_version, rollout_percent, deployed_by)
         SELECT ?, 'v1', 100, 0 FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM ai_prompt_deployments WHERE agent_type = ? AND prompt_version = 'v1' AND rolled_back_at IS NULL)`,
        [agentType, agentType]
      );
    }
    console.log('Prompt v1 导入完成');
  } catch (error) {
    console.error('Prompt v1 导入失败:', error.message);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
