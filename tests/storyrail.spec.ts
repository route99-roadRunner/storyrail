import { expect, test, type Page } from '@playwright/test'

async function startNewProject(page: Page) {
  await expect(page.getByRole('heading', { name: '첫 이야기를 위한 레일을 놓아 보세요.' })).toBeVisible()
  await page.getByLabel('새 작품 이름').fill('나의 웹소설')
  await page.getByRole('button', { name: '첫 회차 만들기' }).click()
}

test('회차를 집필하고 구조와 재료 상태를 새로고침 후 복원한다', async ({ page }) => {
  await page.goto('/')
  await startNewProject(page)

  const projectTitle = page.getByLabel('작품 제목')
  await expect(projectTitle).toHaveValue('나의 웹소설')
  await projectTitle.fill('브라우저 검증 작품')

  await expect(page.getByText('오프닝 훅', { exact: true }).first()).toBeVisible()
  await page.keyboard.press('Control+Enter')
  await expect(page.getByText('즉각적인 목표 제시', { exact: true }).first()).toBeVisible()

  await page.getByRole('tab', { name: '재료', exact: true }).click()
  await page.getByRole('button', { name: '+ 개그', exact: true }).click()
  await page.locator('.ingredient-title').fill('첫 농담')

  await page.locator('.tiptap p').first().click()
  await expect(page.locator('.selection-hint')).toHaveClass(/ready/)
  await page.getByRole('button', { name: '문단 연결', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('현재 문단에 재료를 연결했습니다.')
  await expect(page.locator('.tiptap p').first()).toHaveAttribute('data-guide-tags', '첫 농담')

  await expect(page.locator('.save-state')).toHaveClass(/saved/)
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
  await expect(page.locator('.save-state')).toHaveClass(/saved/)
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
  await startNewProject(page)
  const manuscript = '가'.repeat(20_000)
  await page.locator('.tiptap p').first().fill(manuscript)
  await expect(page.getByText('20,000자', { exact: true })).toBeVisible()
  await expect(page.locator('.save-state')).toHaveClass(/saved/)
  await page.reload()
  await expect(page.locator('.tiptap p').first()).toHaveText(manuscript)
})


test('집중 모드를 단축키와 Esc로 종료하고 새로고침 후 복구한다', async ({ page }) => {
  await page.goto('/')
  await startNewProject(page)

  await page.keyboard.press('Control+Shift+F')
  await expect(page.getByRole('status', { name: '집중 모드 안내' })).toBeVisible()
  await expect(page.getByRole('button', { name: '집중 모드 종료' })).toBeVisible()
  await expect(page.locator('.titlebar')).toBeHidden()
  await expect(page.getByText('Esc', { exact: true })).toBeVisible()

  await expect(page.locator('.save-state')).toHaveClass(/saved/)
  await page.reload()
  await expect(page.getByRole('button', { name: '집중 모드 종료' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.titlebar')).toBeVisible()
  await expect(page.getByTitle('집중 모드 (Ctrl+Shift+F)')).toBeVisible()
})



test('주요 집필 화면의 버튼 이름과 키보드 포커스를 제공한다', async ({ page }) => {
  await page.goto('/')
  await startNewProject(page)

  const buttons = page.locator('button:visible')
  const buttonCount = await buttons.count()
  for (let index = 0; index < buttonCount; index += 1) {
    await expect(buttons.nth(index)).toHaveAccessibleName(/\S+/)
  }

  await expect(page.getByRole('textbox', { name: '원고 편집기' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '진행' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: '재료' }).click()
  await expect(page.getByRole('tab', { name: '재료' })).toHaveAttribute('aria-selected', 'true')

  await page.getByLabel('회차 제목').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('장면 제목')).toBeFocused()
})


test('회차 준비부터 집필, 복선, 마감과 다음 회차 연속성까지 순차 검증한다', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await startNewProject(page)

  // 작품 구조: 총 3개 회차를 준비하고 두 번째 회차를 연다.
  const addEpisode = page.getByTitle('회차 추가').first()
  await page.locator('.tree-arc-title').hover()
  await addEpisode.click()
  await page.locator('.tree-arc-title').hover()
  await addEpisode.click()
  await page.getByRole('button', { name: /002 2화/ }).click()

  // 회차 준비: 목표, 시작·종료 상태와 필수 사건을 입력한다.
  await page.getByRole('tab', { name: '플롯' }).click()
  await page.getByLabel('이번 회차 한 줄 목표').fill('조작된 시험의 증거를 찾는다.')
  await page.getByLabel('시작 상태').fill('시험 결과를 의심한다.')
  await page.getByLabel('목표 종료 상태').fill('조작의 단서를 확보한다.')
  const requiredEvents = page.locator('.panel-section').filter({ hasText: '반드시 일어날 사건' })
  await requiredEvents.locator('button').first().click()
  await page.getByPlaceholder('사건을 입력하세요').fill('붉은 반지의 흔적을 발견한다.')

  // 구조 프리셋을 적용하고 회차 전용 단계 문구를 수정한다.
  await page.getByRole('tab', { name: '진행' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.preset-row select').selectOption('preset-progress')
  await page.locator('.step-copy input').first().fill('수정한 오프닝 훅')
  await expect(page.getByText('수정한 오프닝 훅', { exact: true }).first()).toBeVisible()

  // 원고를 직접 쓰고 첫 문단을 선택한다.
  const editor = page.getByRole('textbox', { name: '원고 편집기' })
  await editor.fill('시험 결과표에는 설명할 수 없는 흔적이 있었다.')
  await page.locator('.tiptap p').first().click()

  // 재료를 문단에 연결하고 다른 재료는 다음 회차로 이동한다.
  await page.getByRole('tab', { name: '재료' }).click()
  await page.getByRole('button', { name: '+ 개그' }).click()
  const jokeCard = page.locator('.ingredient-card').last()
  await jokeCard.locator('.ingredient-title').fill('긴장 완화 농담')
  await jokeCard.getByRole('button', { name: '문단 연결' }).click()
  await expect(page.locator('.tiptap p').first()).toHaveAttribute('data-guide-tags', '긴장 완화 농담')

  await page.getByRole('button', { name: '+ 보상' }).click()
  const rewardCard = page.locator('.ingredient-card').last()
  await rewardCard.locator('.ingredient-title').fill('작은 보상')
  await rewardCard.getByRole('button', { name: '다음 화로' }).click()
  await expect(rewardCard.locator('select').last()).toHaveValue('moved')

  await page.getByRole('button', { name: '+ 사이다' }).click()
  const requiredCard = page.locator('.ingredient-card').last()
  await requiredCard.locator('.ingredient-title').fill('필수 반격')
  await requiredCard.locator('select').nth(1).selectOption('required')

  // 복선 원장을 만들고 이번 화 이벤트를 현재 문단에 배치한다.
  await page.getByRole('tab', { name: '복선' }).click()
  page.once('dialog', (dialog) => dialog.accept('붉은 반지'))
  await page.getByRole('button', { name: '복선 추가' }).click()
  await page.getByLabel('실제 의미').fill('시험 조작자의 신분 증표')
  await page.getByLabel('독자의 현재 인식').fill('평범한 장신구')
  await page.getByRole('button', { name: '이번 화 이벤트' }).click()
  await page.getByRole('button', { name: '현재 문단 배치' }).click()
  await expect(page.getByRole('button', { name: '문단 보기' })).toBeVisible()

  // 구조 레일을 끝까지 진행한다.
  await page.getByRole('tab', { name: '진행' }).click()
  for (let index = 0; index < 9; index += 1) await page.keyboard.press('Control+Enter')
  await expect(page.locator('.step-item.complete')).toHaveCount(9)

  // 실제 결과와 연속성 정보를 기록하고 필수 항목 경고를 수락해 마감한다.
  await page.getByRole('tab', { name: '결과' }).click()
  await expect(page.getByText('필수 재료 1개가 남았습니다.')).toBeVisible()
  await page.getByLabel('실제 회차 결과').fill('주인공이 조작의 단서를 확보했다.')
  const changes = page.locator('.panel-section').filter({ hasText: '인물·설정 변화' })
  await changes.locator('button').first().click()
  await page.getByPlaceholder('다음 화에도 유지할 변화').fill('주인공이 붉은 반지를 소지한다.')
  const questions = page.locator('.panel-section').filter({ hasText: '미해결 질문' })
  await questions.locator('button').first().click()
  await page.getByPlaceholder('독자가 아직 답을 모르는 질문').fill('누가 시험을 조작했는가?')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '회차 완료' }).click()
  await expect(page.getByText('완료된 회차')).toBeVisible()

  // 다음 회차에서 이전 결과와 이동된 재료가 이어지는지 확인한다.
  await page.getByRole('button', { name: /003 3화/ }).click()
  await page.getByRole('tab', { name: '플롯' }).click()
  await expect(page.getByText('이전 회차에서 이어짐 · 2화')).toBeVisible()
  await expect(page.getByText('주인공이 조작의 단서를 확보했다.')).toBeVisible()
  await expect(page.getByText('변화 · 주인공이 붉은 반지를 소지한다.')).toBeVisible()
  await expect(page.getByText('질문 · 누가 시험을 조작했는가?')).toBeVisible()
  await page.getByRole('tab', { name: '재료' }).click()
  await expect(page.locator('.ingredient-title')).toHaveValue('작은 보상')

  await expect(page.locator('.save-state')).toHaveClass(/saved/)
  await page.reload()
  await expect(page.getByRole('button', { name: /003 3화/ })).toBeVisible()
})


