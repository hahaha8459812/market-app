<script setup>
import { reactive, watch, ref, computed } from 'vue';
import { useShopStore } from '../../stores/shop';
import * as shopApi from '../../api/shops';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps(['shop', 'members']);
const shopStore = useShopStore();
const members = computed(() => props.members || []);
const roleText = (role) => {
  if (role === 'OWNER') return '店长';
  if (role === 'CLERK') return '店员';
  if (role === 'CUSTOMER') return '顾客';
  return role || '';
};
const canKick = (row) => {
  const myRole = props.shop.member?.role;
  if (!myRole) return false;
  if (row.role === 'OWNER') return false;
  if (row.id === props.shop.member?.id) return false;
  if (myRole === 'OWNER') return true;
  if (myRole === 'CLERK') return row.role === 'CUSTOMER';
  return false;
};
const canPromote = (row) => props.shop.member?.role === 'OWNER' && row.role === 'CUSTOMER';
const canDemote = (row) => props.shop.member?.role === 'OWNER' && row.role === 'CLERK';

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

const handleKick = async (row) => {
  try {
    await ElMessageBox.confirm(`确认踢出「${row.charName}」？`, '提示', { type: 'warning' });
    await shopApi.kickMember(props.shop.shop.id, row.id);
    ElMessage.success('已踢出');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // handled
  }
};

// Currencies
const currencyForm = reactive({ name: '' });

const handleCreateCurrency = async () => {
  const name = String(currencyForm.name || '').trim();
  if (!name) return ElMessage.warning('请输入币种名');
  try {
    await shopApi.createCurrency(props.shop.shop.id, name);
    ElMessage.success('币种已创建');
    currencyForm.name = '';
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // handled
  }
};

const handleRenameCurrency = async (row) => {
  try {
    const res = await ElMessageBox.prompt('请输入新的币种名', '币种改名', {
      inputValue: row.name,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v).trim() ? true : '币种名不能为空'),
    });
    const next = String(res.value).trim();
    if (!next || next === row.name) return;
    await shopApi.updateCurrency(props.shop.shop.id, row.id, next);
    ElMessage.success('已改名');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // cancel/handled
  }
};

const handleDeleteCurrency = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除币种「${row.name}」？删除后使用该币种定价的商品将变为“无标价/不可购买”。`, '危险操作', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await shopApi.deleteCurrency(props.shop.shop.id, row.id);
    ElMessage.success('已删除');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // cancel/handled
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
      <template #header>币种管理</template>
      <div class="currency-actions">
        <el-input v-model="currencyForm.name" placeholder="新增币种名" style="max-width: 240px" />
        <el-button type="primary" @click="handleCreateCurrency">创建币种</el-button>
      </div>
      <el-table :data="props.shop.currencies || []" size="small" style="margin-top: 10px">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="isActive" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '启用' : '已删除' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="handleRenameCurrency(row)">改名</el-button>
            <el-button size="small" type="danger" plain :disabled="!row.isActive" @click="handleDeleteCurrency(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
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
             <el-tag size="small" :type="row.role === 'OWNER' ? 'danger' : row.role === 'CLERK' ? 'warning' : 'info'">{{ roleText(row.role) }}</el-tag>
           </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <div v-if="row.role !== 'OWNER'">
              <el-button v-if="canPromote(row)" type="warning" link @click="handleSetRole(row.id, 'CLERK')">升为店员</el-button>
              <el-button v-if="canDemote(row)" type="success" link @click="handleSetRole(row.id, 'CUSTOMER')">降为顾客</el-button>
              <el-button v-if="canKick(row)" type="danger" link @click="handleKick(row)">踢出</el-button>
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
.currency-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
