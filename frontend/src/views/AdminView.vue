<script setup>
import { ref, onMounted, reactive } from 'vue';
import * as adminApi from '../api/admin';
import { ElMessage, ElMessageBox } from 'element-plus';

const activeTab = ref('users');
const users = ref([]);
const stats = ref(null);
const config = ref({ allow_register: true, ws_ping_interval_ms: 25000 });
const selectedUserId = ref(null);
const userDetail = ref(null);

const createUserForm = reactive({ username: '', password: '' });

const loadData = async () => {
  try {
    const [u, s, c] = await Promise.all([
      adminApi.getUsers(),
      adminApi.getStats(),
      adminApi.getConfig()
    ]);
    users.value = u.data;
    stats.value = s.data;
    config.value = {
      allow_register: !!c.data.features.allowRegister,
      ws_ping_interval_ms: Number(c.data.ws.pingIntervalMs || 25000)
    };
  } catch (err) {
    // handled
  }
};

onMounted(loadData);

const handleCreateUser = async () => {
  try {
    await adminApi.createUser(createUserForm);
    ElMessage.success('用户已创建');
    createUserForm.username = '';
    createUserForm.password = '';
    loadData();
  } catch (err) {
    // handled
  }
};

const handleSelectUser = async (row) => {
  selectedUserId.value = row.id;
  try {
    const res = await adminApi.getUserDetail(row.id);
    userDetail.value = res.data;
  } catch (err) {
    // handled
  }
};

const handleDeleteUser = async () => {
  if (!selectedUserId.value) return;
  try {
    await ElMessageBox.confirm('确认删除该用户？此操作不可逆！', '警告', { type: 'error' });
    await adminApi.deleteUser(selectedUserId.value);
    ElMessage.success('用户已删除');
    selectedUserId.value = null;
    userDetail.value = null;
    loadData();
  } catch (err) {
    // cancel or error
  }
};

const handleSaveConfig = async () => {
  try {
    await adminApi.updateConfig(config.value);
    ElMessage.success('配置已保存（需重启容器生效）');
  } catch (err) {
    // handled
  }
};
</script>

<template>
  <div class="admin-view">
    <el-tabs v-model="activeTab" type="border-card" class="admin-tabs">
      <el-tab-pane label="用户管理" name="users">
        <div class="admin-content">
          <el-row :gutter="20">
            <el-col :xs="24" :md="10">
              <el-card shadow="never">
                <template #header>创建用户</template>
                <el-form :model="createUserForm" label-width="70px">
                  <el-form-item label="用户名">
                    <el-input v-model="createUserForm.username" />
                  </el-form-item>
                  <el-form-item label="密码">
                    <el-input v-model="createUserForm.password" type="password" show-password />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="handleCreateUser">创建账号</el-button>
                    <el-button @click="loadData">刷新</el-button>
                  </el-form-item>
                </el-form>
                <el-divider />
                <el-table :data="users" size="small" highlight-current-row @row-click="handleSelectUser" style="cursor: pointer" height="400">
                  <el-table-column prop="id" label="ID" width="60" />
                  <el-table-column prop="username" label="用户名" />
                  <el-table-column prop="createdAt" label="注册时间" />
                </el-table>
              </el-card>
            </el-col>
            
            <el-col :xs="24" :md="14">
              <el-card shadow="never" class="detail-card">
                <template #header>用户详情</template>
                <div v-if="!selectedUserId" class="empty-text">请选择左侧用户以查看详情</div>
                <div v-else>
                  <div class="detail-header">
                    <h3>{{ userDetail?.user.username }} (ID: {{ userDetail?.user.id }})</h3>
                    <el-button type="danger" size="small" @click="handleDeleteUser">删除用户</el-button>
                  </div>
                  <div v-if="userDetail" class="detail-body">
                    <el-divider content-position="left">管理的小店</el-divider>
                    <ul v-if="userDetail.asOwner.length">
                      <li v-for="s in userDetail.asOwner" :key="s.shopId">{{ s.shopName }} ({{ s.role }})</li>
                    </ul>
                    <div v-else class="empty-sub">无</div>

                    <el-divider content-position="left">加入的小店</el-divider>
                    <ul v-if="userDetail.asCustomer.length">
                      <li v-for="s in userDetail.asCustomer" :key="s.shopId">{{ s.shopName }} ({{ s.role }})</li>
                    </ul>
                    <div v-else class="empty-sub">无</div>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </el-tab-pane>

      <el-tab-pane label="系统配置" name="config">
        <div class="admin-content">
          <el-card shadow="never" class="config-card">
            <template #header>config.toml 设置</template>
            <el-form label-width="140px">
              <el-form-item label="允许注册">
                <el-switch v-model="config.allow_register" />
              </el-form-item>
              <el-form-item label="WS Ping间隔(ms)">
                <el-input-number v-model="config.ws_ping_interval_ms" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="handleSaveConfig">保存配置</el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <el-card shadow="never" style="margin-top: 20px">
            <template #header>平台统计</template>
            <div v-if="stats" class="stats-grid">
               <div class="stat-box">
                 <div class="label">用户总数</div>
                 <div class="value">{{ stats.users }}</div>
               </div>
               <div class="stat-box">
                 <div class="label">店铺总数</div>
                 <div class="value">{{ stats.shops }}</div>
               </div>
               <div class="stat-box">
                 <div class="label">活跃成员</div>
                 <div class="value">{{ stats.activeMembers }}</div>
               </div>
               <div class="stat-box">
                 <div class="label">商品总数</div>
                 <div class="value">{{ stats.products }}</div>
               </div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.admin-view {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.admin-tabs {
  min-height: 600px;
}

.empty-text {
  color: #909399;
  padding: 40px;
  text-align: center;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  h3 { margin: 0; }
}

.empty-sub {
  color: #c0c4cc;
  font-size: 12px;
  padding-left: 20px;
}

.config-card {
  max-width: 600px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.stat-box {
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  
  .label { font-size: 12px; color: #909399; margin-bottom: 8px; }
  .value { font-size: 28px; font-weight: bold; color: #303133; }
}
</style>
