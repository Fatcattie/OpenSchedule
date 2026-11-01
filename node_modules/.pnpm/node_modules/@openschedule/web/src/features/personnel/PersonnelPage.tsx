/**
 * PersonnelPage —— 人员管理（真实 API 版）
 *
 * R3/R4/R5/R7-6：数据与权限全部来自服务端（services/api/src/openapi/*.yaml 契约）：
 * - 列表 / 创建 / 编辑 / 状态 / 删除走 Bearer client（统一 axios 拦截器注入 Bearer + 401 自动 refresh）；
 *   历史 sessionClient / X-CSRF-Token / cookie 会话已删除，鉴权由 RequireAuth + authApi.fetchMe 闭环。
 * - 菜单与操作按钮按 /me/capabilities 的能力矩阵显隐（FR-007）；越权请求仍由服务端矩阵拒绝（FR-008）
 * - 边界规则：admin 仅管理 member；super_admin 管理 admin 与 member；最后一名活跃 super_admin 受 409 保护（FR-002）
 * 路由 /users 由 RequireAuth 保护，本组件再做 403/无权限兜底（前端隐藏 ≠ 授权）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  createPersonnel,
  deletePersonnel,
  getMyPersonnelCapabilities,
  listPersonnel,
  setPersonnelStatus,
  updatePersonnel,
  type PersonnelRole,
  type PersonnelUser,
  type PersonnelUserStatus,
} from '@/api/client'
import { ApiClientError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'
import EmptyView from '@/components/EmptyView'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography

const ROLE_LABEL: Record<PersonnelRole, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  member: '普通成员',
}

function isForbidden(error: unknown): boolean {
  return error instanceof ApiClientError && (error.code === 40301 || error.httpStatus === 403)
}

type EditTarget = PersonnelUser | null

export default function PersonnelPage() {
  const { message } = App.useApp()
  const token = theme.useToken().token
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // R7-6：身份从 authStore.user（RequireAuth 经 /auth/me Bearer 已恢复）+ Bearer client 链路；
  // 历史 sessionClient 路径已删除。如 authStore.user 为空说明 RequireAuth 还在恢复中。
  const me = useAuthStore((s) => s.user)

  // 能力矩阵（FR-007）：按钮/菜单显隐的唯一来源（Bearer /me/capabilities）
  const capsQuery = useQuery({
    queryKey: ['personnel-capabilities'],
    queryFn: getMyPersonnelCapabilities,
    enabled: me !== null,
  })

  // 列表服务端筛选 + 游标分页（FR-005）
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | PersonnelUserStatus>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | PersonnelRole>('all')
  const [cursor, setCursor] = useState<string | null>(null)

  const caps = capsQuery.data?.personnel
  const manageable = useMemo(() => new Set(caps?.manageableRoles ?? []), [caps])

  const listQuery = useQuery({
    queryKey: ['personnel', keyword.trim(), statusFilter, roleFilter, cursor],
    enabled: me !== null,
    queryFn: () =>
      listPersonnel({
        search: keyword.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        role: roleFilter === 'all' ? undefined : roleFilter,
        limit: 50,
        cursor: cursor ?? undefined,
      }),
  })

  const invalidateList = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['personnel'] })
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createPersonnel>[0]) => createPersonnel(input),
    onSuccess: () => {
      message.success('人员已创建')
      invalidateList()
    },
    onError: (error) => message.error(getPersonnelErrorMessage(error)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updatePersonnel>[1] }) => updatePersonnel(id, patch),
    onSuccess: () => {
      message.success('人员信息已更新')
      invalidateList()
    },
    onError: (error) => message.error(getPersonnelErrorMessage(error)),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PersonnelUserStatus }) => setPersonnelStatus(id, { status }),
    onSuccess: () => {
      message.success('状态已更新')
      invalidateList()
    },
    onError: (error) => message.error(getPersonnelErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePersonnel(id),
    onSuccess: () => {
      message.success('人员已删除')
      invalidateList()
    },
    onError: (error) => message.error(getPersonnelErrorMessage(error)),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EditTarget>(null)
  const [form] = Form.useForm()

  // 必须在所有早期 return 之前声明（Hooks 顺序约束）。当 caps 尚未加载时返回 false 占位；
  // 编辑/删除按钮的显隐由 caps.update / caps.assignRole 派生，能力未就绪时一律隐藏。
  const canManageTarget = useCallback(
    (user: PersonnelUser): boolean =>
      caps !== undefined && caps.update && (manageable.has(user.role) || caps.assignRole),
    [caps, manageable],
  )

  useEffect(() => {
    if (!modalOpen) return
    form.setFieldsValue(editing ? { displayName: editing.displayName, email: editing.email } : {})
  }, [modalOpen, editing, form])

  // 权限矩阵兜底：member 无人员管理入口（FR-007）
  if (caps && caps.list === false) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Title level={4}>无权限访问</Title>
        <Text type="secondary">人员管理仅管理员 / 超级管理员可见</Text>
        <div style={{ marginTop: 16 }}>
          <Button type="primary" onClick={() => navigate('/workspace')}>返回工作台</Button>
        </div>
      </div>
    )
  }

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (user: PersonnelUser) => {
    setEditing(user)
    setModalOpen(true)
  }

  const handleSubmit = (values: { displayName: string; email: string; role?: PersonnelRole; password?: string }) => {
    if (editing) {
      const patch: Parameters<typeof updatePersonnel>[1] = {
        displayName: values.displayName,
        email: values.email,
      }
      // 角色指派仅 super_admin（capability.assignRole）；请求体提权会被服务端拒绝（FR-008）
      if (caps?.assignRole && values.role && values.role !== editing.role) patch.role = values.role
      updateMutation.mutate({ id: editing.id, patch })
    } else {
      createMutation.mutate({
        displayName: values.displayName,
        email: values.email,
        role: values.role ?? 'member',
        password: values.password ?? '',
      })
    }
    setModalOpen(false)
  }

  const columns: ColumnsType<PersonnelUser> = [
    {
      title: '头像',
      key: 'avatar',
      width: 64,
      // 契约 User 无 avatarUrl（FR-003 最小投影）：统一占位图标，不伪造图片
      render: (_, record) => <Avatar icon={<UserOutlined />} aria-label={record.displayName} />,
    },
    { title: '姓名', dataIndex: 'displayName' },
    { title: '邮箱（账号）', dataIndex: 'email' },
    {
      title: '角色',
      dataIndex: 'role',
      width: 120,
      render: (role: PersonnelRole) => (
        <Tag color={role === 'super_admin' ? 'processing' : role === 'admin' ? 'success' : 'default'}>
          {ROLE_LABEL[role] ?? role}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: PersonnelUserStatus) => (
        <Tag color={status === 'active' ? 'success' : 'default'}>{status === 'active' ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_: unknown, record: PersonnelUser) => (
        <Space size="small">
          {caps?.update && canManageTarget(record) ? (
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label={`编辑 ${record.displayName}`}
              onClick={() => openEdit(record)}
            >
              编辑
            </Button>
          ) : (
            <Text type="secondary" style={{ paddingInline: 8 }}>
              只读
            </Text>
          )}
          {caps?.setStatus && manageable.has(record.role) ? (
            <Popconfirm
              title={record.status === 'active' ? '禁用该成员？' : '启用该成员？'}
              okText="确认"
              cancelText="取消"
              onConfirm={() => statusMutation.mutate({ id: record.id, status: record.status === 'active' ? 'disabled' : 'active' })}
            >
              <Button type="text" size="small" aria-label={record.status === 'active' ? `禁用 ${record.displayName}` : `启用 ${record.displayName}`}>
                {record.status === 'active' ? '禁用' : '启用'}
              </Button>
            </Popconfirm>
          ) : null}
          {caps?.delete && manageable.has(record.role) ? (
            <Popconfirm
              title="删除该人员？删除后不可恢复。"
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => deleteMutation.mutate(record.id)}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`删除 ${record.displayName}`}>
                删除
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ]

  const busy = createMutation.isPending || updateMutation.isPending || statusMutation.isPending || deleteMutation.isPending

  // 能力矩阵加载中：表头就绪但操作列整体占位，避免闪现错误按钮（FR-007 的过渡态）
  const capsPending = capsQuery.isLoading || capsQuery.isPending

  return (
    <div style={{ padding: 24, color: token.colorText }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            人员管理
          </Title>
          <Text type="secondary">
            当前身份：{ROLE_LABEL[capsQuery.data?.role ?? 'member']} · 可管理范围：{caps?.manageableRoles?.length
              ? caps.manageableRoles.map((r) => ROLE_LABEL[r]).join('、')
              : '无'}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} aria-label="刷新人员列表" onClick={() => invalidateList()}>
            刷新
          </Button>
          {caps?.create && (
            <Button type="primary" icon={<PlusOutlined />} aria-label="创建人员" onClick={openCreate} disabled={busy}>
              创建人员
            </Button>
          )}
        </Space>
      </div>

      {listQuery.isError && isForbidden(listQuery.error) ? (
        <Alert type="warning" showIcon message="无权限访问人员管理" description="你的角色不具备人员管理权限，请联系超级管理员调整角色。" />
      ) : listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="人员列表加载失败"
          description={`${getPersonnelErrorMessage(listQuery.error)}。请检查网络或稍后重试。`}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => listQuery.refetch()}>
              重试
            </Button>
          }
        />
      ) : (
        <>
          <Space wrap size={12} style={{ marginBottom: 16 }}>
            <Input
              placeholder="搜索姓名 / 邮箱"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 240 }}
              allowClear
              aria-label="搜索人员"
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 120 }}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'active', label: '启用' },
                { value: 'disabled', label: '禁用' },
              ]}
              aria-label="按状态筛选"
            />
            {caps?.list && caps.manageableRoles.length > 0 && caps.manageableRoles.includes('admin') && (
              <Select
                value={roleFilter}
                onChange={setRoleFilter}
                style={{ width: 140 }}
                options={[
                  { value: 'all', label: '全部角色' },
                  { value: 'admin', label: '管理员' },
                  { value: 'member', label: '普通成员' },
                ]}
                aria-label="按角色筛选"
              />
            )}
            <Text type="secondary">共 {listQuery.data?.items.length ?? 0} 人</Text>
          </Space>

          <Spin spinning={listQuery.isLoading || listQuery.isFetching}>
            {listQuery.data && listQuery.data.items.length === 0 && !capsPending ? (
              <EmptyView description="暂无符合条件的人员" />
            ) : (
              <Table
                rowKey="id"
                dataSource={listQuery.data?.items ?? []}
                columns={columns}
                pagination={false}
                locale={{ emptyText: capsPending ? '加载中…' : '暂无数据' }}
              />
            )}
          </Spin>
          {(() => {
            const nextCursor = listQuery.data?.nextCursor
            return nextCursor ? (
              <Button style={{ marginTop: 12 }} onClick={() => setCursor(nextCursor)}>
                加载更多
              </Button>
            ) : null
          })()}
        </>
      )}

      <Modal
        title={editing ? '编辑人员' : '创建人员'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={busy}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="displayName" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="email" label="邮箱（账号）" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input maxLength={320} />
          </Form.Item>
          {!editing && caps?.create ? (
            <Form.Item
              name="role"
              label="角色"
              initialValue="member"
              rules={[{ required: true }]}
            >
              <Select
                options={(caps.manageableRoles.length > 0 ? caps.manageableRoles : (['member'] as PersonnelRole[])).map((r) => ({
                  value: r,
                  label: ROLE_LABEL[r],
                }))}
              />
            </Form.Item>
          ) : null}
          {!editing && caps?.create ? (
            <Form.Item
              name="password"
              label="初始密码"
              rules={[
                {
                  validator: (_, value) =>
                    typeof value === 'string' && value.length >= 12
                      ? Promise.resolve()
                      : Promise.reject(new Error('密码至少 12 位')),
                },
              ]}
            >
              <Input.Password aria-label="初始密码" />
            </Form.Item>
          ) : null}
          {editing && caps?.assignRole ? (
            <Form.Item name="role" label="调整角色（可选）">
              <Select
                allowClear
                placeholder="保持不变"
                options={(['admin', 'member'] as PersonnelRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </div>
  )
}

function getPersonnelErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 40903) return '系统必须保留至少一名活跃超级管理员'
    if (error.code === 40301) return '没有权限执行该操作'
    if (error.code === 40401) return '目标人员不存在或不可见'
    return `[${error.code}] ${error.message || '操作失败'}`
  }
  if (error instanceof Error) return error.message
  return '操作失败，请稍后重试'
}
