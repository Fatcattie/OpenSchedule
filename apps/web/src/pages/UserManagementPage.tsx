/**
 * UserManagementPage —— 人员管理（仅管理员）
 *
 * 功能：
 * - 快速创建：账号、密码、名称
 * - 深度创建：名称、头像、电话、住址、邮箱、个人简介、座右铭、账号、密码
 * - 员工列表：修改、删除、启用/禁用
 * - 模糊查找 + 启用/禁用筛选
 */
import { useMemo, useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { useUsers } from '@/hooks/useUsers'
import type { User, UserStatus } from '@/types'

const { Title, Text } = Typography

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}

export default function UserManagementPage() {
  const navigate = useNavigate()
  const [role] = useLocalStorageState<'manager' | 'member'>('workspace_role', 'manager')
  const { users, createUser, updateUser, deleteUser, setUserStatus } = useUsers()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form] = Form.useForm()
  const [avatar, setAvatar] = useState<string | null>(null)
  const [createMode, setCreateMode] = useState<'quick' | 'deep'>('quick')

  // 权限兜底：非管理员跳回工作台
  if (role !== 'manager') {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Title level={4}>无权限访问</Title>
        <Text type="secondary">人员管理仅管理人员可见</Text>
        <div style={{ marginTop: 16 }}>
          <Button type="primary" onClick={() => navigate('/workspace')}>返回工作台</Button>
        </div>
      </div>
    )
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (!kw) return true
      return (
        u.displayName.toLowerCase().includes(kw) ||
        u.email.toLowerCase().includes(kw) ||
        (u.phone ?? '').toLowerCase().includes(kw) ||
        (u.address ?? '').toLowerCase().includes(kw) ||
        (u.bio ?? '').toLowerCase().includes(kw) ||
        (u.motto ?? '').toLowerCase().includes(kw)
      )
    })
  }, [users, keyword, statusFilter])

  const openCreate = (mode: 'quick' | 'deep') => {
    setEditing(null)
    setCreateMode(mode)
    setAvatar(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (user: User) => {
    setEditing(user)
    setCreateMode('deep')
    setAvatar(user.avatarUrl)
    form.setFieldsValue({
      displayName: user.displayName,
      email: user.email,
      phone: user.phone ?? '',
      address: user.address ?? '',
      bio: user.bio ?? '',
      motto: user.motto ?? '',
      status: user.status,
      password: '',
    })
    setModalOpen(true)
  }

  const handleSubmit = (values: Record<string, unknown>) => {
    const common = {
      displayName: values.displayName as string,
      email: values.email as string,
      avatarUrl: avatar,
      phone: values.phone as string | undefined,
      address: values.address as string | undefined,
      bio: values.bio as string | undefined,
      motto: values.motto as string | undefined,
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: (values.status as UserStatus) ?? 'active',
    }
    if (editing) {
      updateUser(editing.id, {
        ...common,
        // 编辑时若填写了新密码则“修改”，这里不存储真实密码，仅做演示
      })
      if (values.password) {
        message.success('员工资料已更新（密码修改仅为本地演示）')
      } else {
        message.success('员工资料已更新')
      }
    } else {
      createUser(common)
      message.success('新员工已创建')
    }
    setModalOpen(false)
    form.resetFields()
    setAvatar(null)
  }

  const beforeUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件')
      return false
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error('头像大小不能超过 2MB')
      return false
    }
    try {
      const base64 = await fileToBase64(file)
      setAvatar(base64)
      message.success('头像已加载')
    } catch {
      message.error('头像读取失败')
    }
    return false
  }

  const columns = [
    {
      title: '头像',
      dataIndex: 'avatarUrl',
      width: 80,
      render: (url: string | null) => <Avatar src={url || undefined} icon={<UserOutlined />} />,
    },
    { title: '名称', dataIndex: 'displayName' },
    { title: '账号（邮箱）', dataIndex: 'email' },
    {
      title: '电话',
      dataIndex: 'phone',
      render: (_: unknown, record: User) => record.phone || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: UserStatus) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>{status === 'active' ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      width: 220,
      render: (_: unknown, record: User) => (
        <Space>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>修改</Button>
          <Button
            type="text"
            size="small"
            onClick={() => setUserStatus(record.id, record.status === 'active' ? 'disabled' : 'active')}
          >
            {record.status === 'active' ? '禁用' : '启用'}
          </Button>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteUser(record.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col><Title level={3} style={{ margin: 0 }}>人员管理</Title></Col>
        <Col>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate('quick')}>快速创建</Button>
            <Button icon={<PlusOutlined />} onClick={() => openCreate('deep')}>深度创建</Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ marginBottom: 24 }}>
        <Space wrap size={16}>
          <Input
            placeholder="搜索名称、邮箱、电话、住址、简介、座右铭"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 320 }}
            allowClear
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
          />
          <Text type="secondary">共 {filtered.length} 人</Text>
        </Space>
      </Card>

      <Table
        rowKey="id"
        dataSource={filtered}
        columns={columns}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editing ? '修改员工' : createMode === 'quick' ? '快速创建员工' : '深度创建员工'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        width={createMode === 'deep' || editing ? 720 : 480}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {(createMode === 'deep' || editing) && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Avatar size={80} src={avatar || undefined} icon={<UserOutlined />} style={{ marginBottom: 8 }} />
              <div>
                <Upload beforeUpload={beforeUpload} accept="image/*" showUploadList={false}>
                  <Button icon={<UploadOutlined />}>上传头像</Button>
                </Upload>
              </div>
            </div>
          )}

          {createMode === 'quick' && !editing ? (
            <>
              <Form.Item name="displayName" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="email" label="账号（邮箱）" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
                <Input.Password />
              </Form.Item>
            </>
          ) : (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="displayName" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="email" label="账号（邮箱）" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="phone" label="电话">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="address" label="住址">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="bio" label="个人简介">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item name="motto" label="座右铭">
                <Input />
              </Form.Item>
              <Form.Item name="password" label={editing ? '新密码（留空则不修改）' : '密码'} rules={editing ? [] : [{ required: true, min: 6, message: '密码至少 6 位' }]}>
                <Input.Password />
              </Form.Item>
              {editing && (
                <Form.Item name="status" label="状态">
                  <Radio.Group
                    options={[
                      { value: 'active', label: '启用' },
                      { value: 'disabled', label: '禁用' },
                    ]}
                  />
                </Form.Item>
              )}
            </>
          )}
        </Form>
      </Modal>
    </div>
  )
}
