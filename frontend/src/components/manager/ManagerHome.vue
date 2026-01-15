<script setup>
import { reactive, watch, ref, computed } from 'vue';
import { useShopStore } from '../../stores/shop';
import * as shopApi from '../../api/shops';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps(['shop', 'members']);
const shopStore = useShopStore();
const members = computed(() => props.members || []);

const settingsForm = reactive({ name: '' });
const inviteTtl = ref(10);
const invites = ref([]);

watch(() => props.shop, (val) => {
  if (val) {
    settingsForm.name = val.shop.name;
    loadInvites();
  }
}, { immediate: true });

const handleSaveSettings = async () => {
  try {
    await shopApi.updateShopName(props.shop.shop.id, settingsForm.name);
    ElMessage.success('保存成功');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // handled
  }
};

const handleDeleteShop = async () => {
  try {
    await ElMessageBox.confirm('确认注销小店？数据不可恢复！', '危险操作', { type: 'error' });
    await shopApi.deleteShop(props.shop.shop.id);
    ElMessage.success('小店已注销');
    window.location.href = '/';
  } catch (err) {
    // handled
  }
};

const loadInvites = async () => {
  try {
    const res = await shopApi.getInvites(props.shop.shop.id);
    invites.value = res.data;
  } catch (err) {
    invites.value = [];
  }
};

const handleCreateInvite = async () => {
  try {
    await shopApi.createInvite(props.shop.shop.id, inviteTtl.value);
    ElMessage.success('邀请码已生成');
    loadInvites();
  } catch (err) {
    // handled
  }
};

const handleDeleteInvite = async (id) => {
  await shopApi.deleteInvite(props.shop.shop.id, id);
  loadInvites();
};

const handleSetRole = async (memberId, role) => {
  try {
    await shopApi.setMemberRole(props.shop.shop.id, { memberId, role });
    ElMessage.success('身份已更新');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // handled
  }
};

const handleEditCharName = async () => {
  try {
    const res = await ElMessageBox.prompt('请输入新的角色名', '修改角色名', {
      inputValue: props.shop.member?.charName || '',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v).trim() ? true : '角色名不能为空'),
    });
    const next = String(res.value).trim();
    await shopApi.updateCharName(props.shop.shop.id, next);
    ElMessage.success('角色名已更新');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // cancel or handled
  }
};

// Kick user (actually just delete member if API supported it, but API only has set-role or leave. 
// Wait, API doc says DELETE /users/:id is admin only.
// There is no explicit "kick member" API in the provided doc?
// Check API.md... 
// "DELETE /shops/:shopId/leave" is for self.
// "DELETE /admin/users/:id" is for super admin.
// It seems there is NO KICK API for shop owner in the provided doc!
// I will just implement role change for now, or maybe I missed something.
// Re-reading API.md...
// "DELETE /shops/:shopId/leave" -> "退出小店（仅顾客）"
// "DELETE /shops/:shopId" -> "注销小店"
// No kick endpoint. I will assume "Set Role" is the only management or I can't implement kick.
// But the MindMap says "点击用户末尾有红色“踢出小店”按钮".
// I'll double check API.md...
// Indeed, no kick endpoint. I will ask the user or just stub it?
// Actually, I can't modify the backend. I will implement "Set Role" and maybe add a note or just omit Kick if not possible.
// Wait, maybe I can use setMemberRole to something that removes them? No.
// I'll stick to what's possible: Role management.
// Or maybe I missed it. Let me check `backend/src/shop/shop.controller.ts` if possible?
// I can't check backend code easily without `read_file`.
// I'll assume I can't kick for now, but I will put the button and show "Not implemented in API".
// OR, I can use `DELETE /shops/:shopId/members/:memberId` if it existed.
// I will just show role management.
</script>

<template>
  <div class="manager-home">
    <el-card class="section-card" shadow="never">
      <template #header>店铺设置</template>
      <el-form inline>
        <el-form-item label="店名">
          <el-input v-model="settingsForm.name" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSaveSettings">保存</el-button>
        </el-form-item>
      </el-form>
      <el-button v-if="props.shop.member?.role === 'OWNER'" type="danger" plain size="small" @click="handleDeleteShop">注销本店</el-button>
    </el-card>

    <el-card class="section-card" shadow="never">
      <template #header>邀请码管理</template>
      <div class="invite-controls">
        <el-input-number v-model="inviteTtl" :min="1" :max="1440" label="有效期(分)" />
        <el-button type="primary" @click="handleCreateInvite">生成邀请码</el-button>
      </div>
      <el-table :data="invites" size="small" style="margin-top: 10px">
        <el-table-column prop="code" label="邀请码" />
        <el-table-column prop="expiresAt" label="过期时间" />
        <el-table-column label="操作">
            <template #default="{ row }">
              <el-button type="danger" link size="small" @click="handleDeleteInvite(row.id)">删除</el-button>
            </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="section-card" shadow="never">
      <template #header>成员管理</template>
      <div style="margin-bottom: 10px;">
        <el-button size="small" @click="handleEditCharName">修改我的角色名</el-button>
      </div>
      <el-table :data="members" size="small">
        <el-table-column prop="charName" label="角色名" />
        <el-table-column prop="role" label="身份">
           <template #default="{ row }">
             <el-tag size="small" :type="row.role === 'OWNER' ? 'danger' : row.role === 'CLERK' ? 'warning' : 'info'">{{ row.role }}</el-tag>
           </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <div v-if="props.shop.member?.role === 'OWNER' && row.role !== 'OWNER'">
              <el-button v-if="row.role === 'CUSTOMER'" type="warning" link @click="handleSetRole(row.id, 'CLERK')">升为店员</el-button>
              <el-button v-if="row.role === 'CLERK'" type="success" link @click="handleSetRole(row.id, 'CUSTOMER')">降为顾客</el-button>
              <!-- Kick button placeholder -->
              <el-tooltip content="API暂不支持踢人" placement="top">
                <el-button type="danger" link disabled>踢出</el-button>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.section-card {
  margin-bottom: 20px;
}
.invite-controls {
  display: flex;
  gap: 10px;
}
</style>
