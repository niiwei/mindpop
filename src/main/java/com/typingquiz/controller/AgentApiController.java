package com.typingquiz.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.typingquiz.config.ApiAuthenticationFilter;
import com.typingquiz.dto.QuizDTO;
import com.typingquiz.dto.QuizGroupDTO;
import com.typingquiz.dto.QuizResponseDTO;
import com.typingquiz.entity.AgentImportRequest;
import com.typingquiz.entity.Quiz;
import com.typingquiz.entity.QuizGroup;
import com.typingquiz.entity.QuizType;
import com.typingquiz.repository.AgentImportRequestRepository;
import com.typingquiz.repository.QuizGroupRepository;
import com.typingquiz.repository.QuizRepository;
import com.typingquiz.repository.UserRepository;
import com.typingquiz.service.DeletionTokenService;
import com.typingquiz.service.QuizGroupService;
import com.typingquiz.service.QuizService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.converter.HttpMessageNotReadableException;

import javax.servlet.http.HttpServletRequest;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/agent/v1")
@Transactional
public class AgentApiController {
    private final UserRepository userRepository;
    private final QuizService quizService;
    private final QuizGroupService groupService;
    private final QuizRepository quizRepository;
    private final QuizGroupRepository groupRepository;
    private final AgentImportRequestRepository importRepository;
    private final DeletionTokenService deletionTokenService;
    private final ObjectMapper objectMapper;
    @PersistenceContext
    private EntityManager entityManager;

    public AgentApiController(QuizService quizService, QuizGroupService groupService,
                              QuizRepository quizRepository, QuizGroupRepository groupRepository,
                              AgentImportRequestRepository importRepository,
                              DeletionTokenService deletionTokenService, ObjectMapper objectMapper, UserRepository userRepository) {
        this.userRepository = userRepository;
        this.quizService = quizService;
        this.groupService = groupService;
        this.quizRepository = quizRepository;
        this.groupRepository = groupRepository;
        this.importRepository = importRepository;
        this.deletionTokenService = deletionTokenService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/quizzes")
    public ResponseEntity<?> listQuizzes(@RequestParam(required = false) String query,
                                         @RequestParam(required = false) Long groupId,
                                         @RequestParam(required = false) QuizType type,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size,
                                         HttpServletRequest request) {
        if (page < 0 || size < 1 || size > 100) return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", "分页参数无效");
        Long userId = userId(request);
        List<Quiz> all = quizRepository.findByUserIdSimple(userId).stream()
                .filter(q -> query == null || query.trim().isEmpty() || q.getTitle().toLowerCase().contains(query.trim().toLowerCase()))
                .filter(q -> type == null || q.getQuizType() == type)
                .filter(q -> groupId == null || groupRepository.findByIdWithQuizzes(groupId)
                        .map(g -> g.getUserId().equals(userId) && g.getQuizzes().stream().anyMatch(item -> item.getId().equals(q.getId())))
                        .orElse(false))
                .collect(Collectors.toList());
        int from = Math.min(page * size, all.size());
        int to = Math.min(from + size, all.size());
        List<Map<String, Object>> items = all.subList(from, to).stream().map(this::quizSummary).collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("items", items, "page", page, "size", size, "total", all.size(), "hasNext", to < all.size()));
    }

    @GetMapping("/quizzes/{id}")
    public ResponseEntity<?> getQuiz(@PathVariable Long id, HttpServletRequest request) {
        Long userId = userId(request);
        Quiz quiz = ownedQuiz(id, userId);
        QuizResponseDTO dto = quizService.toResponseDTO(quiz);
        Map<String, Object> result = objectMapper.convertValue(dto, Map.class);
        result.put("groups", groupRepository.findByQuizzesIdAndUserId(id, userId).stream().map(QuizGroup::getName).collect(Collectors.toList()));
        result.put("writable", quiz.getQuizType() == QuizType.TYPING);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/quizzes")
    public ResponseEntity<?> createQuiz(@RequestBody QuizDTO dto, HttpServletRequest request) {
        Long userId = writeUserId(request);
        if (dto.getQuizType() == QuizType.FILL_BLANK) return error(HttpStatus.UNPROCESSABLE_ENTITY, "UNSUPPORTED_QUIZ_TYPE", "Agent API v1 只支持 TYPING 写入");
        if (dto.getAnswerList() == null || dto.getAnswerList().isEmpty()) return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_QUIZ", "TYPING 必须至少包含一条答案");
        if (dto.getAnswerList().stream().anyMatch(answer -> answer == null || answer.getContent() == null || answer.getContent().trim().isEmpty())) return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_QUIZ", "答案内容不能为空");
        try {
            rejectAmbiguousGroups(dto, userId);
            Quiz quiz = quizService.createQuiz(dto, userId);
            return ResponseEntity.status(HttpStatus.CREATED).body(getQuiz(quiz.getId(), request).getBody());
        } catch (IllegalArgumentException e) {
            return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_QUIZ", e.getMessage());
        }
    }

    @PatchMapping("/quizzes/{id}")
    public ResponseEntity<?> updateQuiz(@PathVariable Long id, @RequestBody JsonNode body, HttpServletRequest request) {
        Long userId = writeUserId(request);
        Quiz existing = ownedQuiz(id, userId);
        if (existing.getQuizType() != QuizType.TYPING) return error(HttpStatus.UNPROCESSABLE_ENTITY, "UNSUPPORTED_QUIZ_TYPE", "Agent API v1 只支持 TYPING 写入");
        if (!body.hasNonNull("version") || existing.getVersion() == null || existing.getVersion().longValue() != body.get("version").longValue()) {
            return conflict(existing);
        }
        try {
            QuizDTO merged = quizService.convertToDTO(existing);
            if (body.has("title")) merged.setTitle(body.get("title").isNull() ? null : body.get("title").asText());
            if (body.has("description")) merged.setDescription(body.get("description").isNull() ? null : body.get("description").asText());
            if (body.has("timeLimit")) merged.setTimeLimit(body.get("timeLimit").isNull() ? null : body.get("timeLimit").asInt());
            if (body.has("answerList")) {
                JsonNode answers = body.get("answerList");
                if (!answers.isArray() || answers.isEmpty()) return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_QUIZ", "TYPING 必须至少包含一条答案");
                merged.setAnswerList(objectMapper.convertValue(answers, objectMapper.getTypeFactory().constructCollectionType(List.class, com.typingquiz.dto.AnswerCreateDTO.class)));
                if (merged.getAnswerList().stream().anyMatch(answer -> answer == null || answer.getContent() == null || answer.getContent().trim().isEmpty())) return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_QUIZ", "答案内容不能为空");
            }
            else merged.setAnswerList(null);
            if (body.has("answerList")) {
                entityManager.lock(existing, javax.persistence.LockModeType.PESSIMISTIC_FORCE_INCREMENT);
            }
            Quiz updated = quizService.updateQuiz(id, merged, userId);
            entityManager.flush();
            return getQuiz(updated.getId(), request);
        } catch (IllegalArgumentException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_QUIZ", e.getMessage());
        }
    }

    @PostMapping("/imports")
    public ResponseEntity<?> importQuizzes(@RequestBody JsonNode body, HttpServletRequest request) {
        Long userId = writeUserId(request);
        String requestId = body.hasNonNull("requestId") ? body.get("requestId").asText() : null;
        JsonNode quizzes = body.get("quizzes");
        if (requestId == null || !isUuid(requestId) || quizzes == null || !quizzes.isArray() || quizzes.size() == 0) {
            return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", "需要 UUID requestId 和非空 quizzes 数组");
        }
        String payloadHash = hash(quizzes.toString());
        Optional<AgentImportRequest> previous = importRepository.findByUserIdAndRequestId(userId, requestId);
        if (previous.isPresent()) {
            if (!previous.get().getPayloadHash().equals(payloadHash)) return error(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "requestId 已用于其他内容");
            try { return ResponseEntity.ok(objectMapper.readValue(previous.get().getResponseJson(), Map.class)); }
            catch (Exception e) { return error(HttpStatus.INTERNAL_SERVER_ERROR, "STORED_RESULT_INVALID", "历史导入结果损坏"); }
        }
        List<Map<String, Object>> created = new ArrayList<>();
        try {
            List<QuizDTO> validated = new ArrayList<>();
            for (JsonNode node : quizzes) {
                QuizDTO dto = objectMapper.treeToValue(node, QuizDTO.class);
                if (dto.getQuizType() == QuizType.FILL_BLANK) throw new IllegalArgumentException("Agent API v1 只支持 TYPING 写入");
                if (dto.getAnswerList() == null || dto.getAnswerList().isEmpty()) throw new IllegalArgumentException("TYPING 必须至少包含一条答案");
                if (dto.getTitle() == null || dto.getTitle().trim().isEmpty()) throw new IllegalArgumentException("测验标题不能为空");
                if (dto.getTimeLimit() != null && dto.getTimeLimit() < 0) throw new IllegalArgumentException("时间限制不能为负数");
                if (dto.getAnswerList().stream().anyMatch(answer -> answer == null || answer.getContent() == null || answer.getContent().trim().isEmpty())) throw new IllegalArgumentException("答案内容不能为空");
                if (dto.getGroups() != null && dto.getGroups().stream().anyMatch(group -> group == null || group.trim().isEmpty())) throw new IllegalArgumentException("分组名称不能为空");
                rejectAmbiguousGroups(dto, userId);
                validated.add(dto);
            }
            for (QuizDTO dto : validated) {
                Quiz quiz = quizService.createQuiz(dto, userId);
                created.add(Map.of("id", quiz.getId(), "title", quiz.getTitle(), "version", quiz.getVersion()));
            }
            Map<String, Object> response = Map.of("requestId", requestId, "created", created, "count", created.size());
            AgentImportRequest record = new AgentImportRequest();
            record.setUserId(userId); record.setRequestId(requestId); record.setPayloadHash(payloadHash); record.setResponseJson(objectMapper.writeValueAsString(response));
            importRepository.save(record);
            return ResponseEntity.ok(response);
        } catch (DataIntegrityViolationException e) {
            throw e;
        } catch (Exception e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return error(HttpStatus.UNPROCESSABLE_ENTITY, "IMPORT_REJECTED", e.getMessage());
        }
    }

    @PostMapping("/quizzes/{id}/delete-preview")
    public ResponseEntity<?> previewQuizDelete(@PathVariable Long id, HttpServletRequest request) {
        Quiz quiz = ownedQuiz(id, userId(request));
        if (quiz.getQuizType() != QuizType.TYPING) return error(HttpStatus.UNPROCESSABLE_ENTITY, "UNSUPPORTED_QUIZ_TYPE", "Agent API v1 只支持 TYPING 写入");
        return ResponseEntity.ok(Map.of("id", id, "title", quiz.getTitle(), "version", quiz.getVersion(), "answerCount", quiz.getAnswers().size(), "groupCount", groupRepository.findByQuizzesId(id).size(), "confirmationToken", deletionTokenService.issue("quiz", id, userId(request), quiz.getVersion())));
    }

    @DeleteMapping("/quizzes/{id}")
    public ResponseEntity<?> deleteQuiz(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        Long userId = writeUserId(request); Quiz quiz = ownedQuiz(id, userId);
        if (quiz.getQuizType() != QuizType.TYPING) return error(HttpStatus.UNPROCESSABLE_ENTITY, "UNSUPPORTED_QUIZ_TYPE", "Agent API v1 只支持 TYPING 写入");
        String token = body == null ? null : String.valueOf(body.get("confirmationToken"));
        if (!deletionTokenService.verify(token, "quiz", id, userId, quiz.getVersion())) return error(HttpStatus.CONFLICT, "CONFIRMATION_INVALID", "删除预览已过期或资源已变化");
        quizService.deleteQuiz(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/groups")
    public ResponseEntity<?> listGroups(HttpServletRequest request) { return ResponseEntity.ok(groupService.toDTOList(groupService.getAllGroups(userId(request)))); }

    @GetMapping("/groups/{id}")
    public ResponseEntity<?> getGroup(@PathVariable Long id, HttpServletRequest request) { return ResponseEntity.ok(groupMap(ownedGroup(id, userId(request)))); }

    @PostMapping("/groups")
    public ResponseEntity<?> createGroup(@RequestBody QuizGroupDTO dto, HttpServletRequest request) {
        Long userId = writeUserId(request);
        if (dto.getName() == null || dto.getName().trim().isEmpty() || groupRepository.existsByUserIdAndNameIgnoreCase(userId, dto.getName().trim())) return error(HttpStatus.UNPROCESSABLE_ENTITY, "GROUP_NAME_TAKEN", "分组名称已存在或为空");
        return ResponseEntity.status(HttpStatus.CREATED).body(groupMap(groupService.createGroup(dto, userId)));
    }

    @PatchMapping("/groups/{id}")
    public ResponseEntity<?> updateGroup(@PathVariable Long id, @RequestBody JsonNode body, HttpServletRequest request) {
        Long userId = writeUserId(request); QuizGroup group = ownedGroup(id, userId);
        if (!body.hasNonNull("version") || !group.getVersion().equals(body.get("version").longValue())) return groupConflict(group);
        if (body.has("name") && !body.get("name").isNull()) {
            String name = body.get("name").asText().trim();
            if (name.isEmpty() || groupRepository.findByNameIgnoreCaseAndUserId(name, userId).stream().anyMatch(item -> !item.getId().equals(id))) return error(HttpStatus.UNPROCESSABLE_ENTITY, "GROUP_NAME_TAKEN", "分组名称已存在或为空");
            group.setName(name);
        }
        if (body.has("description")) group.setDescription(body.get("description").isNull() ? null : body.get("description").asText());
        if (body.has("displayOrder")) group.setDisplayOrder(body.get("displayOrder").isNull() ? 0 : body.get("displayOrder").asInt());
        QuizGroup updated = groupRepository.save(group);
        entityManager.flush();
        return ResponseEntity.ok(groupMap(updated));
    }

    @PostMapping("/groups/{id}/delete-preview")
    public ResponseEntity<?> previewGroupDelete(@PathVariable Long id, HttpServletRequest request) { QuizGroup group = ownedGroup(id, userId(request)); return ResponseEntity.ok(Map.of("id", id, "name", group.getName(), "version", group.getVersion(), "quizCount", group.getQuizzes().size(), "confirmationToken", deletionTokenService.issue("group", id, userId(request), group.getVersion()))); }

    @DeleteMapping("/groups/{id}")
    public ResponseEntity<?> deleteGroup(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        Long userId = writeUserId(request); QuizGroup group = ownedGroup(id, userId); String token = body == null ? null : String.valueOf(body.get("confirmationToken"));
        if (!deletionTokenService.verify(token, "group", id, userId, group.getVersion())) return error(HttpStatus.CONFLICT, "CONFIRMATION_INVALID", "删除预览已过期或资源已变化");
        groupService.deleteGroup(id, userId); return ResponseEntity.noContent().build();
    }

    @PostMapping("/groups/{groupId}/quizzes/{quizId}")
    public ResponseEntity<?> addQuiz(@PathVariable Long groupId, @PathVariable Long quizId, HttpServletRequest request) { Long userId = writeUserId(request); QuizGroup group = ownedGroup(groupId, userId); Quiz quiz = ownedQuiz(quizId, userId); group.addQuiz(quiz); return ResponseEntity.ok(groupMap(groupRepository.save(group))); }

    @DeleteMapping("/groups/{groupId}/quizzes/{quizId}")
    public ResponseEntity<?> removeQuiz(@PathVariable Long groupId, @PathVariable Long quizId, HttpServletRequest request) { Long userId = writeUserId(request); QuizGroup group = ownedGroup(groupId, userId); ownedQuiz(quizId, userId); group.getQuizzes().removeIf(q -> q.getId().equals(quizId)); return ResponseEntity.ok(groupMap(groupRepository.save(group))); }

    private void rejectAmbiguousGroups(QuizDTO dto, Long userId) {
        if (dto.getGroups() == null) return;
        for (String name : dto.getGroups()) {
            if (name != null && groupRepository.findByNameIgnoreCaseAndUserId(name.trim(), userId).size() > 1) {
                throw new IllegalArgumentException("存在同名分组，请先人工处理：" + name.trim());
            }
        }
    }

    private Long writeUserId(HttpServletRequest request) {
        Long id = userId(request);
        // Serialize account writes across PATs and application instances until commit.
        userRepository.findByIdForUpdate(id).orElseThrow(() -> new NoSuchElementException("用户不存在"));
        return id;
    }

    private Long userId(HttpServletRequest request) { return (Long) request.getAttribute(ApiAuthenticationFilter.USER_ID_ATTRIBUTE); }
    private Quiz ownedQuiz(Long id, Long userId) { return quizRepository.findByIdAndUserId(id, userId).orElseThrow(() -> new NoSuchElementException("测验不存在")); }
    private QuizGroup ownedGroup(Long id, Long userId) { return groupRepository.findByIdAndUserIdWithQuizzes(id, userId).orElseThrow(() -> new NoSuchElementException("分组不存在")); }
    private Map<String, Object> quizSummary(Quiz quiz) { Map<String, Object> m = new LinkedHashMap<>(); m.put("id", quiz.getId()); m.put("version", quiz.getVersion()); m.put("title", quiz.getTitle()); m.put("description", quiz.getDescription()); m.put("quizType", quiz.getQuizType()); m.put("createdAt", quiz.getCreatedAt()); m.put("writable", quiz.getQuizType() == QuizType.TYPING); m.put("totalAnswers", quiz.getAnswers() == null ? 0 : quiz.getAnswers().size()); return m; }
    private Map<String, Object> groupMap(QuizGroup group) { Map<String, Object> m = new LinkedHashMap<>(); m.put("id", group.getId()); m.put("version", group.getVersion()); m.put("name", group.getName()); m.put("description", group.getDescription()); m.put("displayOrder", group.getDisplayOrder()); m.put("quizIds", group.getQuizzes().stream().map(Quiz::getId).collect(Collectors.toList())); return m; }
    private ResponseEntity<Map<String, Object>> conflict(Quiz quiz) { return error(HttpStatus.CONFLICT, "VERSION_CONFLICT", "题库版本已变化", quizSummary(quiz)); }
    private ResponseEntity<Map<String, Object>> groupConflict(QuizGroup group) { return error(HttpStatus.CONFLICT, "VERSION_CONFLICT", "分组版本已变化", groupMap(group)); }
    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) { return error(status, code, message, Collections.emptyMap()); }
    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message, Object details) { return ResponseEntity.status(status).body(Map.of("code", code, "message", message == null ? "请求失败" : message, "details", details)); }
    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoSuchElementException e) { return error(HttpStatus.NOT_FOUND, "NOT_FOUND", e.getMessage()); }
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> invalidArgument(IllegalArgumentException e) { return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_ARGUMENT", e.getMessage()); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> integrity(DataIntegrityViolationException e) { return error(HttpStatus.CONFLICT, "CONFLICT", "资源约束冲突"); }
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, Object>> optimistic(ObjectOptimisticLockingFailureException e) { return error(HttpStatus.CONFLICT, "VERSION_CONFLICT", "资源版本已变化"); }
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> typeMismatch(MethodArgumentTypeMismatchException e) { return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", "请求参数格式无效"); }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> unreadable(HttpMessageNotReadableException e) { return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", "请求 JSON 无效"); }
    private boolean isUuid(String value) { try { UUID.fromString(value); return true; } catch (Exception e) { return false; } }
    private String hash(String value) { try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format("%02x", b)); return out.toString(); } catch (Exception e) { throw new IllegalStateException(e); } }
}
