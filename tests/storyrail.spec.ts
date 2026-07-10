import { expect, test } from '@playwright/test'

test('회차를 집필하고 구조와 재료 상태를 새로고침 후 복원한다', async ({ page }) => {
  await page.goto('/')

  const projectTitle = page.getByLabel('작품 제목')
  await expect(projectTitle).toHaveValue('나의 웹소설')
  await projectTitle.fill('브라우저 검증 작품')

  await expect(page.getByText('오프닝 훅', { exact: true }).first()).toBeVisible()
  await page.keyboard.press('Control+Enter')
  await expect(page.getByText('즉각적인 목표 제시', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: '재료', exact: true }).click()
  await page.getByRole('button', { name: '+ 개그', exact: true }).click()
  await page.locator('.ingredient-title').fill('첫 농담')

  await page.locator('.tiptap p').first().click()
  await expect(page.locator('.selection-hint')).toHaveClass(/ready/)
  await page.getByRole('button', { name: '문단 연결', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('현재 문단에 재료를 연결했습니다.')
  await expect(page.locator('.tiptap p').first()).toHaveAttribute('data-guide-tags', '첫 농담')

  await expect(page.getByText('저장됨', { exact: true })).toBeVisible()
  await page.reload()

  await expect(page.getByLabel('작품 제목')).toHaveValue('브라우저 검증 작품')
  await expect(page.locator('.tiptap p').first()).toHaveAttribute('data-guide-tags', '첫 농담')
  await expect(page.getByText('즉각적인 목표 제시', { exact: true }).first()).toBeVisible()

  const projectDownloadPromise = page.waitForEvent('download')
  await page.getByTitle('프로젝트 내보내기').click()
  const projectDownload = await projectDownloadPromise
  const backupPath = await projectDownload.path()
  expect(backupPath).toBeTruthy()

  await page.getByLabel('작품 제목').fill('가져오기 전 임시 제목')
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByTitle('프로젝트 가져오기').click()
  const chooser = await chooserPromise
  await chooser.setFiles(backupPath!)
  await expect(page.getByLabel('작품 제목')).toHaveValue('브라우저 검증 작품')

  for (const format of ['MD', 'TXT']) {
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: format, exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename().toLowerCase()).toContain(`.${format.toLowerCase()}`)
  }
})

test('장문 원고를 입력하고 자동 저장한다', async ({ page }) => {
  await page.goto('/')
  const manuscript = '가'.repeat(20_000)
  await page.locator('.tiptap p').first().fill(manuscript)
  await expect(page.getByText('20,000자', { exact: true })).toBeVisible()
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.tiptap p').first()).toHaveText(manuscript)
})
