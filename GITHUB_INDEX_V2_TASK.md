# GitHub Index Intelligence Engine v2

Repository: ALEVOLDON/index

Цель: улучшить существующий GitHub Index / Portfolio Engine без переписывания архитектуры с нуля. Система должна лучше определять состояние проектов, активность, momentum, категории и рекомендации для Featured.

# **1\. Аудит существующей системы**

* Изучить README.md, core/fetchRepos.js, analysis/engine.py, core/autoDiscovery.js, scripts/validate.js, render/renderReadme.js, config/projects.json, data/repos.json, data/insights.json и .github/workflows/update\_readme.yml.  
* Понять полный pipeline: GitHub API → fetchRepos → repos.json → analysis → insights.json → autoDiscovery → projects.json → validation → README → commit.  
* Не ломать существующую функциональность без необходимости.

# **2\. Улучшить Health Score**

* Создать более содержательный health\_score. Учитывать description, topics, README, source code, package/config files, tests, CI, license, releases, stars, forks и recent activity.  
* Health должен измерять качество и полноту проекта, а не только популярность.

# **3\. Activity Score**

* Сохранить отдельный activity\_score.  
* Учитывать возраст последнего push, commits за 7/30/90 дней, releases и issues/PR activity, если это разумно доступно.

# **4\. Momentum Score**

* Добавить momentum\_score для обнаружения проектов, которые недавно снова стали активно развиваться.  
* Momentum должен быть независим от общего health.  
* Пример: старый проект с низким health, но большим количеством недавних commits может иметь высокий momentum.

# **5\. Multi-label категоризация**

* Сохранить существующие категории: ai, music, frontend, creative, productivity, archive.  
* Добавить primary\_category и secondary\_categories.  
* Не использовать принцип «первое совпадение keyword → категория».  
* Считать score для каждой категории на основе manual config, topics, description, metadata, language/ecosystem и структуры проекта.  
* Ручная категория из projects.json имеет высший приоритет.

# **6\. Recommendation Score**

* Добавить recommendation\_score.  
* Он должен учитывать health, activity, momentum, documentation, stars, recency и completeness.  
* Recommendation не должен автоматически менять featured=true.  
* Хранить рекомендации в data/insights.json, если отдельный файл не даёт явного преимущества.

# **7\. Featured остаётся под ручным контролем**

* Система только рекомендует кандидатов в Featured.  
* Для рекомендации показывать score и причины: высокая активность, документация, completeness, momentum и т.п.

# **8\. Rising / Recently Active Projects**

* Добавить rising\_projects в generated insights.  
* Показывать проекты с высоким momentum и объяснение причины.

# **9\. Сохранить Auto Discovery**

* Не ломать автоматическое обнаружение новых репозиториев, исключение forks и index, создание/закрытие discovery Issues и автоматическое добавление проектов в projects.json.

# **10\. Конфигурация**

* Новые thresholds и weights не хардкодить по всему коду.  
* При необходимости создать config/intelligence.json.  
* Пороговые значения и веса сделать настраиваемыми.

# **11\. Deterministic design**

* Не добавлять LLM, embeddings, vector DB, neural networks или внешние AI API.  
* Система должна быть быстрой, дешёвой, детерминированной, предсказуемой и легко отлаживаемой.

# **12\. GitHub API efficiency**

* Проверить pagination, rate limits, количество запросов, дублирование запросов и caching.  
* Не делать ненужные API calls.

# **13\. Тестирование**

* Добавить тесты для scoring и categorization.  
* Проверить минимум: AI Telegram bot; Music \+ Web Audio \+ Three.js; abandoned project; revived project; fork; index.

# **14\. README**

* Не делать радикальный редизайн.  
* После улучшения engine при необходимости добавить небольшой блок Recently Active / Rising Projects.  
* README должен оставаться читаемым и ориентированным на портфолио.

# **15\. Backward compatibility**

* Старый формат projects.json должен продолжать работать.  
* Новые поля добавлять постепенно.  
* Не требовать ручной переработки всех существующих репозиториев.

# **16\. Финальная проверка**

* Запустить полный pipeline локально.  
* Проверить repos.json, insights.json, projects.json, validation и generated README.  
* Проверить GitHub Actions.  
* Исправить ошибки до завершения задачи.

# **17\. Финальный отчёт агента**

* Перечислить изменённые и созданные файлы.  
* Показать новые метрики.  
* Показать 5–10 реальных репозиториев и их primary/secondary categories.  
* Показать Rising Projects.  
* Показать Featured Recommendations.  
* Перечислить нерешённые проблемы.  
* Дать оценки Architecture, Scoring, Classification, Discovery, Automation, Testing и Overall.  
* Отдельно указать, что управляется автоматически, а что остаётся под ручным контролем.

# **Критическое правило**

Не оптимизировать систему ради сложности. Она должна лучше отвечать на вопрос: «Что сейчас происходит с моим GitHub ecosystem, какие проекты действительно живы, какие набирают momentum и какие стоит показывать людям?»

Сначала понять существующую систему → затем улучшить → протестировать → только потом менять README. Не удалять существующую функциональность без необходимости.