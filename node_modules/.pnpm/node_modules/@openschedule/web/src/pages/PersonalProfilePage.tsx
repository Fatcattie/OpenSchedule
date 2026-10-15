/**
 * PersonalProfilePage —— 个人资料
 *
 * 支持设置：名称、头像、电话、住址、邮箱、个人简介、座右铭；
 * 同时支持修改密码（本地模拟，仅做前端校验）。
 */
import { useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Typography,
  Upload,
  message,
} from 'antd'
import { EditOutlined, LockOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons'
import { useUsers } from '@/hooks/useUsers'

const { Title, Text } = Typography

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}

export default function PersonalProfilePage() {
  const { me, updateMe } = useUsers()
  const [editOpen, setEditOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [form] = Form.useForm()
  const [pwdForm] = Form.useForm()
  const [avatar, setAvatar] = useState<string | null>(me.avatarUrl)

  const handleEdit = (values: {
    displayName: string
    email: string
    phone?: string
    address?: string
    bio?: string
    motto?: string
  }) => {
    updateMe({
      ...values,
      avatarUrl: avatar,
    })
    setEditOpen(false)
    message.success('个人资料已保存')
  }

  const handleChangePassword = (values: { oldPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致')
      return
    }
    // 前端模拟：不校验旧密码（本地无真实密码存储），直接提示成功
    setPwdOpen(false)
    pwdForm.resetFields()
    message.success('密码已修改（本地演示）')
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
      message.success('头像已更新，请保存资料')
    } catch {
      message.error('头像读取失败')
    }
    return false
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: 24 }}>个人资料</Title>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={8}>
          <Card style={{ textAlign: 'center' }}>
            <Avatar
              size={120}
              src={me.avatarUrl || undefined}
              icon={<UserOutlined />}
              style={{ marginBottom: 16 }}
            />
            <Title level={5} style={{ marginBottom: 4 }}>{me.displayName}</Title>
            <Text type="secondary">{me.email}</Text>
            <div style={{ marginTop: 16 }}>
              <Space>
                <Button type="primary" icon={<EditOutlined />} onClick={() => {
                  setAvatar(me.avatarUrl)
                  form.setFieldsValue({
                    displayName: me.displayName,
                    email: me.email,
                phone: me.phone ?? '',
                address: me.address ?? '',
                bio: me.bio ?? '',
                motto: me.motto ?? '',
                  })
                  setEditOpen(true)
                }}>
                  编辑资料
                </Button>
                <Button icon={<LockOutlined />} onClick={() => setPwdOpen(true)}>修改密码</Button>
              </Space>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card
            title="基本信息"
            extra={<TagStatus status={me.status} />}
          >
            <Descriptions column={{ xs: 1, sm: 2 }} bordered>
              <Descriptions.Item label="名称">{me.displayName}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{me.email}</Descriptions.Item>
              <Descriptions.Item label="电话">{me.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="住址">{me.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="个人简介" span={2}>{me.bio || '-'}</Descriptions.Item>
              <Descriptions.Item label="座右铭" span={2}>{me.motto || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Modal
        title="编辑个人资料"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleEdit}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <Avatar size={80} src={avatar || undefined} icon={<UserOutlined />} style={{ marginBottom: 8 }} />
            <div>
              <Upload beforeUpload={beforeUpload} accept="image/*" showUploadList={false}>
                <Button icon={<UploadOutlined />}>更换头像</Button>
              </Upload>
            </div>
          </div>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="displayName" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
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
            <Input.TextArea rows={3} placeholder="一句话介绍自己" />
          </Form.Item>
          <Form.Item name="motto" label="座右铭">
            <Input placeholder="你的座右铭" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="修改密码"
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        onOk={() => pwdForm.submit()}
        okText="确认修改"
        cancelText="取消"
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请确认新密码' }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function TagStatus({ status }: { status: string }) {
  const color = status === 'active' ? 'green' : 'red'
  const label = status === 'active' ? '启用中' : '已禁用'
  return <Typography.Text type="secondary" style={{ color: `var(--ant-${color})` }}>{label}</Typography.Text>
}
