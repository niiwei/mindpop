/**
 * UIRenderer - UI渲染器
 * 负责所有UI更新和渲染
 */
class UIRenderer {
    /**
     * 渲染答案网格
     * @param {Array} answers - 答案列表
     * @param {Set} foundAnswers - 已找到的答案ID集合
     * @param {boolean} showCommentPreview - 是否显示注释预览
     */
    static renderAnswersGrid(answers, foundAnswers, showCommentPreview = false, foundParts = new Map(), revealedAnswers = new Set()) {
        const grid = document.getElementById('answers-grid');
        grid.innerHTML = '';

        answers.forEach(answer => {
            const item = document.createElement('div');
            item.className = 'answer-item'; // 使用新版 CSS 类名
            item.id = `answer-${answer.id}`;
            item.dataset.content = answer.content;
            item.dataset.comment = answer.comment || '';
            
            this.renderAnswerItem(item, answer, foundAnswers, foundParts, showCommentPreview, false, revealedAnswers);
            grid.appendChild(item);
        });
    }

    static renderAnswerItem(item, answer, foundAnswers, foundParts, showCommentPreview = false, revealAll = false, revealedAnswers = new Set()) {
        item.replaceChildren();
        item.classList.remove('found', 'missed', 'revealed');
        const complete = foundAnswers.has(answer.id);
        const revealed = revealedAnswers.has(answer.id);
        const matched = foundParts.get(answer.id) || new Set();
        const hasPartial = answer.formatVersion === 2 && matched.size > 0 && !complete;
        if (!complete && !hasPartial && !revealAll && !revealed) item.textContent = '•';
        if (!complete && revealAll) item.classList.add('missed');
        else if (complete) item.classList.add('found');
        else if (revealed) item.classList.add('revealed');

        if (answer.formatVersion === 2 && Array.isArray(answer.parts) && hasPartial && !complete && !revealAll && !revealed) {
            answer.parts.forEach((part, index) => {
                const span = document.createElement('span');
                if (matched.has(index)) {
                    span.className = 'answer-content';
                    this.renderAnswerSegments(span, part.segments);
                } else {
                    span.className = 'answer-part-placeholder';
                    span.textContent = '______';
                }
                item.appendChild(span);
            });
        } else if (complete || revealAll || revealed) {
            const content = document.createElement('span');
            content.className = 'answer-content';
            if (answer.formatVersion === 2 && Array.isArray(answer.parts)) {
                answer.parts.forEach(part => this.renderAnswerSegments(content, part.segments));
            } else {
                content.textContent = answer.content;
            }
            item.appendChild(content);
        }
        if ((complete || revealAll || revealed) && showCommentPreview && answer.comment) {
            const comment = document.createElement('span');
            comment.className = 'answer-comment';
            comment.textContent = `#${answer.comment}#`;
            item.appendChild(comment);
        }
        if (!complete && !revealAll && !revealed) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reveal-answer-button';
            button.setAttribute('aria-label', `显示答案 ${answer.id}`);
            button.onclick = () => window.quizController?.revealAnswer(answer.id);
            item.appendChild(button);
        }
    }

    static renderAnswerSegments(container, segments = []) {
        segments.forEach(segment => {
            const span = document.createElement('span');
            span.className = segment.kind === 'required' ? 'answer-required' : 'answer-context';
            span.textContent = segment.text;
            container.appendChild(span);
        });
    }

    /**
     * 高亮已答项
     * @param {number} answerId - 答案ID
     * @param {boolean} showCommentPreview - 是否显示注释预览
     */
    static highlightAnswer(answer, foundAnswers, foundParts, showCommentPreview = false, revealedAnswers = new Set()) {
        const item = document.getElementById(`answer-${answer.id}`);
        if (item) {
            this.renderAnswerItem(item, answer, foundAnswers, foundParts, showCommentPreview, false, revealedAnswers);
        }
    }

    /**
     * 更新得分显示
     */
    static updateScore(found, total) {
        const display = document.getElementById('score-display');
        display.textContent = `${found}/${total}`;
    }

    /**
     * 显示反馈消息
     */
    static showFeedback(message, type) {
        const feedback = document.getElementById('feedback-message');
        feedback.textContent = message;
        feedback.className = type ? `${type}` : '';
    }

    /**
     * 显示所有答案(放弃时使用)
     */
    static showAllAnswers(answers, foundAnswers, foundParts = new Map(), showCommentPreview = true) {
        answers.forEach(answer => {
            const item = document.getElementById(`answer-${answer.id}`);
            if (item && !foundAnswers.has(answer.id)) {
                this.renderAnswerItem(item, answer, foundAnswers, foundParts, showCommentPreview, true);
            }
        });
    }

    /**
     * 显示最终结果 - 内嵌式布局（保留题目区域）
     */
    static showResults(stats, missedAnswers, answers = [], foundAnswers = new Set(), foundParts = new Map(), showCommentPreview = true) {
        // 1. 隐藏输入区域和进度条
        const inputSection = document.getElementById('input-section');
        if (inputSection) inputSection.style.display = 'none';
        
        const progressBar = document.querySelector('.progress-bar');
        if (progressBar) progressBar.style.display = 'none';

        // 2. 保持答案网格/填空题显示，标记最终状态
        if (stats.quizType === 'FILL_BLANK') {
            // 填空题：保持原文显示
            const fillBlankSection = document.getElementById('fill-blank-section');
            if (fillBlankSection) fillBlankSection.style.display = 'block';
        } else {
            // 打字题：保持答案网格，标记未答出项
            const answersGrid = document.getElementById('answers-grid');
            if (answersGrid) {
                answersGrid.style.display = 'grid';
                answers.forEach(answer => {
                    const item = document.getElementById(`answer-${answer.id}`);
                    if (item && !foundAnswers.has(answer.id)) {
                        this.renderAnswerItem(item, answer, foundAnswers, foundParts, showCommentPreview, true);
                    }
                });
            }
        }
        
        // 3. 显示结算面板（内嵌在题目下方）
        const resultsPanel = document.getElementById('results-panel');
        if (resultsPanel) {
            resultsPanel.style.display = 'block';
            // 滚动到结算区域
            setTimeout(() => {
                resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }

        // 4. 更新统计卡片
        const accuracyEl = document.getElementById('final-accuracy');
        const scoreEl = document.getElementById('final-score');
        const timeEl = document.getElementById('final-time');
        
        if (accuracyEl) accuracyEl.textContent = `${stats.accuracy}%`;
        if (scoreEl) scoreEl.textContent = `${stats.found}/${stats.total}`;
        if (timeEl) timeEl.textContent = this.formatTime(stats.timeElapsed);

        // 5. 显示未答出列表或全部答对提示
        const missedSection = document.getElementById('missed-section');
        const perfectSection = document.getElementById('perfect-section');
        const missedContainer = document.getElementById('missed-answers');
        
        if (missedContainer) {
            missedContainer.innerHTML = '';
        }
        
        if (missedAnswers.length > 0) {
            // 有未答出项：显示列表
            if (missedSection) missedSection.style.display = 'block';
            if (perfectSection) perfectSection.style.display = 'none';
            
            missedAnswers.forEach(answer => {
                const item = document.createElement('div');
                item.className = 'missed-item';
                
                // 构建内容：答案 + 注释
                const contentHtml = document.createElement('span');
                contentHtml.className = 'missed-content';
                contentHtml.textContent = answer.content;
                item.appendChild(contentHtml);
                if (answer.comment) {
                    const comment = document.createElement('span');
                    comment.className = 'missed-comment';
                    comment.textContent = `#${answer.comment}#`;
                    item.appendChild(comment);
                }
                missedContainer.appendChild(item);
            });
        } else {
            // 全部答对：显示提示
            if (missedSection) missedSection.style.display = 'none';
            if (perfectSection) perfectSection.style.display = 'flex';
        }
    }

    /**
     * 格式化时间
     */
    static formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}分${secs}秒`;
    }
}
