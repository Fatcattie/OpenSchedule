/**
 * ImageUpload.tsx —— 任务/项目/计划创建时的说明图片上传
 *
 * 限制：最多 6 张，单张 ≤ 5MB，仅图片类型。
 * 图片转为 base64 存入表单，提交时写入 task.images。
 */
import { useState } from 'react'
import { Upload, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd/es/upload/interface'

interface Props {
  value?: string[]
  onChange?: (images: string[]) => void
  maxCount?: number
  maxSizeMB?: number
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}

export default function ImageUpload({ value = [], onChange, maxCount = 6, maxSizeMB = 5 }: Props) {
  const [fileList, setFileList] = useState<UploadFile[]>(
    value.map((url, i) => ({ uid: `img-${i}`, name: `图片${i + 1}`, status: 'done', url })),
  )

  const handleChange: UploadProps['onChange'] = async ({ fileList: newFileList }) => {
    const normalized: UploadFile[] = []
    const base64s: string[] = []

    for (const file of newFileList) {
      if (file.status === 'removed') continue
      if (file.url) {
        normalized.push(file)
        base64s.push(file.url)
        continue
      }
      const origin = file.originFileObj
      if (!origin) continue
      if (!origin.type.startsWith('image/')) {
        message.error(`${origin.name} 不是图片文件`)
        continue
      }
      if (origin.size > maxSizeMB * 1024 * 1024) {
        message.error(`${origin.name} 超过 ${maxSizeMB}MB 限制`)
        continue
      }
      try {
        const dataUrl = await fileToBase64(origin)
        normalized.push({
          uid: file.uid,
          name: origin.name,
          status: 'done',
          url: dataUrl,
        })
        base64s.push(dataUrl)
      } catch {
        message.error(`${origin.name} 读取失败`)
      }
    }

    setFileList(normalized)
    onChange?.(base64s)
  }

  return (
    <Upload
      listType="picture-card"
      fileList={fileList}
      onChange={handleChange}
      beforeUpload={() => false}
      maxCount={maxCount}
      accept="image/*"
    >
      {fileList.length >= maxCount ? null : (
        <div>
          <PlusOutlined />
          <div style={{ marginTop: 8, fontSize: 12 }}>上传图片</div>
        </div>
      )}
    </Upload>
  )
}
