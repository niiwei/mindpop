package com.typingquiz;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.typingquiz.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AgentApiIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void patIsOneTimeAndAgentApiIsPatOnly() throws Exception {
        String jwt = JwtUtil.generateToken(newUserId(), "agent-user");
        String patResponse = mockMvc.perform(post("/api/personal-access-tokens")
                        .header("Authorization", "Bearer " + jwt)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Codex\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode pat = objectMapper.readTree(patResponse);
        String patValue = pat.get("token").asText();
        assertThat(patValue).startsWith("mp_pat_");
        String listed = mockMvc.perform(get("/api/personal-access-tokens").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(listed).get(0).get("token").isNull()).isTrue();

        mockMvc.perform(get("/api/agent/v1/quizzes").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/agent/v1/quizzes").header("Authorization", "Bearer " + patValue))
                .andExpect(status().isOk());

        String created = mockMvc.perform(post("/api/agent/v1/quizzes")
                        .header("Authorization", "Bearer " + patValue)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Agent quiz\",\"quizType\":\"TYPING\",\"answerList\":[{\"content\":\"answer\"}],\"groups\":[\"Work\"]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode createdQuiz = objectMapper.readTree(created);
        assertThat(createdQuiz.get("groups").toString()).contains("Work");
        long quizId = createdQuiz.get("id").asLong();
        long version = createdQuiz.get("version").asLong();
        String updated = mockMvc.perform(patch("/api/agent/v1/quizzes/{id}", quizId)
                        .header("Authorization", "Bearer " + patValue).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":" + version + ",\"description\":\"changed\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long nextVersion = objectMapper.readTree(updated).get("version").asLong();
        assertThat(nextVersion).isGreaterThan(version);
        mockMvc.perform(patch("/api/agent/v1/quizzes/{id}", quizId)
                        .header("Authorization", "Bearer " + patValue).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":" + version + ",\"title\":\"stale\"}"))
                .andExpect(status().isConflict());
        JsonNode preview = objectMapper.readTree(mockMvc.perform(post("/api/agent/v1/quizzes/{id}/delete-preview", quizId)
                        .header("Authorization", "Bearer " + patValue)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(delete("/api/agent/v1/quizzes/{id}", quizId).header("Authorization", "Bearer " + patValue)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"confirmationToken\":\"" + preview.get("confirmationToken").asText() + "\"}"))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/personal-access-tokens/{id}", pat.get("id").asLong())
                        .header("Authorization", "Bearer " + jwt)).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/agent/v1/quizzes").header("Authorization", "Bearer " + patValue))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void importIsAtomicAndIdempotent() throws Exception {
        String jwt = JwtUtil.generateToken(newUserId(), "import-user");
        String pat = objectMapper.readTree(mockMvc.perform(post("/api/personal-access-tokens")
                        .header("Authorization", "Bearer " + jwt).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"import\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("token").asText();
        String body = "{\"requestId\":\"550e8400-e29b-41d4-a716-446655440000\",\"quizzes\":[{\"title\":\"one\",\"quizType\":\"TYPING\",\"answerList\":[{\"content\":\"ok\"}]},{\"title\":\"bad\",\"quizType\":\"FILL_BLANK\"}]}";
        mockMvc.perform(post("/api/agent/v1/imports").header("Authorization", "Bearer " + pat)
                        .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnprocessableEntity());
        JsonNode list = objectMapper.readTree(mockMvc.perform(get("/api/agent/v1/quizzes").header("Authorization", "Bearer " + pat))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(list.get("total").asInt()).isZero();

        String valid = "{\"requestId\":\"550e8400-e29b-41d4-a716-446655440001\",\"quizzes\":[{\"title\":\"one\",\"quizType\":\"TYPING\",\"answerList\":[{\"content\":\"ok\"}]}]}";
        String first = mockMvc.perform(post("/api/agent/v1/imports").header("Authorization", "Bearer " + pat)
                        .contentType(MediaType.APPLICATION_JSON).content(valid)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String replay = mockMvc.perform(post("/api/agent/v1/imports").header("Authorization", "Bearer " + pat)
                        .contentType(MediaType.APPLICATION_JSON).content(valid)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(replay).isEqualTo(first);
    }

    @Test
    void deletingGroupOnlyRemovesMembership() throws Exception {
        String ownerJwt = JwtUtil.generateToken(newUserId(), "group-owner");
        String pat = objectMapper.readTree(mockMvc.perform(post("/api/personal-access-tokens")
                        .header("Authorization", "Bearer " + ownerJwt).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"group\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("token").asText();
        JsonNode quiz = objectMapper.readTree(mockMvc.perform(post("/api/agent/v1/quizzes")
                        .header("Authorization", "Bearer " + pat).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"kept\",\"quizType\":\"TYPING\",\"answerList\":[{\"content\":\"answer\"}],\"groups\":[\"Keep\"]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        long quizId = quiz.get("id").asLong();
        JsonNode groups = objectMapper.readTree(mockMvc.perform(get("/api/agent/v1/groups").header("Authorization", "Bearer " + pat))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode keep = null;
        for (JsonNode item : groups) if ("Keep".equals(item.get("name").asText())) keep = item;
        assertThat(keep).isNotNull();
        JsonNode preview = objectMapper.readTree(mockMvc.perform(post("/api/agent/v1/groups/{id}/delete-preview", keep.get("id").asLong())
                .header("Authorization", "Bearer " + pat)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(delete("/api/agent/v1/groups/{id}", keep.get("id").asLong()).header("Authorization", "Bearer " + pat)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"confirmationToken\":\"" + preview.get("confirmationToken").asText() + "\"}"))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/agent/v1/quizzes/{id}", quizId).header("Authorization", "Bearer " + pat)).andExpect(status().isOk());
        mockMvc.perform(get("/api/agent/v1/groups/{id}", keep.get("id").asLong()).header("Authorization", "Bearer " + pat)).andExpect(status().isNotFound());

        String otherPat = objectMapper.readTree(mockMvc.perform(post("/api/personal-access-tokens")
                        .header("Authorization", "Bearer " + JwtUtil.generateToken(newUserId(), "other"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"other\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("token").asText();
        mockMvc.perform(get("/api/agent/v1/quizzes/{id}", quizId).header("Authorization", "Bearer " + otherPat)).andExpect(status().isNotFound());
    }
    @Autowired com.typingquiz.repository.UserRepository userRepository;
    @Autowired com.typingquiz.repository.QuizGroupRepository groupRepository;

    private Long newUserId() {
        String name = java.util.UUID.randomUUID().toString();
        return userRepository.saveAndFlush(new com.typingquiz.entity.User(name, name + "@test.invalid", "test-password")).getId();
    }

    private String realUserPat() throws Exception {
        return patForUser(newUserId());
    }

    private String patForUser(Long userId) throws Exception {
        return objectMapper.readTree(mockMvc.perform(post("/api/personal-access-tokens")
                .header("Authorization", "Bearer " + JwtUtil.generateToken(userId, "concurrency-user"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + java.util.UUID.randomUUID() + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("token").asText();
    }

    @Test
    void answerOnlyPatchAdvancesVersionAndRejectsStaleOverwrite() throws Exception {
        String pat = realUserPat();
        JsonNode quiz = objectMapper.readTree(mockMvc.perform(post("/api/agent/v1/quizzes")
                .header("Authorization", "Bearer " + pat).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"answers\",\"answerList\":[{\"content\":\"original\"}]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String patchBody = "{\"version\":" + quiz.get("version") + ",\"answerList\":[{\"content\":\"updated\"}]}";
        JsonNode updated = objectMapper.readTree(mockMvc.perform(patch("/api/agent/v1/quizzes/{id}", quiz.get("id").asLong())
                .header("Authorization", "Bearer " + pat).contentType(MediaType.APPLICATION_JSON).content(patchBody))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(updated.get("version").asLong()).isGreaterThan(quiz.get("version").asLong());
        mockMvc.perform(patch("/api/agent/v1/quizzes/{id}", quiz.get("id").asLong())
                .header("Authorization", "Bearer " + pat).contentType(MediaType.APPLICATION_JSON).content(patchBody))
                .andExpect(status().isConflict());
    }


    @Test
    void metadataPatchPreservesAnswersAndInvalidAnswersAreRejected() throws Exception {
        String pat = realUserPat();
        JsonNode quiz = objectMapper.readTree(mockMvc.perform(post("/api/agent/v1/quizzes")
                .header("Authorization", "Bearer " + pat).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"original\",\"answerList\":[{\"content\":\"answer\",\"comment\":\"keep me\"}]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode updated = objectMapper.readTree(mockMvc.perform(patch("/api/agent/v1/quizzes/{id}", quiz.get("id").asLong())
                .header("Authorization", "Bearer " + pat).contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":" + quiz.get("version") + ",\"title\":\"renamed\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(updated.get("answerList")).isEqualTo(quiz.get("answerList"));
        for (String answers : java.util.List.of("null", "[]", "[null]", "[{\"content\":\" \"}]", "[{\"content\":\"bad\",\"formatVersion\":2}]")) {
            mockMvc.perform(patch("/api/agent/v1/quizzes/{id}", quiz.get("id").asLong())
                    .header("Authorization", "Bearer " + pat).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":" + updated.get("version") + ",\"answerList\":" + answers + "}"))
                    .andExpect(status().isUnprocessableEntity());
        }
        JsonNode unchanged = objectMapper.readTree(mockMvc.perform(get("/api/agent/v1/quizzes/{id}", quiz.get("id").asLong())
                .header("Authorization", "Bearer " + pat)).andReturn().getResponse().getContentAsString());
        assertThat(unchanged).isEqualTo(updated);
    }

    @Test
    void simultaneousImportRetriesReturnTheSameResult() throws Exception {
        Long userId = newUserId();
        String pat = patForUser(userId);
        String secondPat = patForUser(userId);
        String body = "{\"requestId\":\"" + java.util.UUID.randomUUID() + "\",\"quizzes\":[{\"title\":\"concurrent\",\"answerList\":[{\"content\":\"answer\"}],\"groups\":[\"shared\"]}]}";
        java.util.List<String> results = parallelImports(java.util.List.of(pat, secondPat), java.util.Collections.nCopies(6, body));
        assertThat(results.stream().distinct().count()).isEqualTo(1);
        JsonNode list = objectMapper.readTree(mockMvc.perform(get("/api/agent/v1/quizzes")
                .header("Authorization", "Bearer " + pat)).andReturn().getResponse().getContentAsString());
        assertThat(list.get("total").asInt()).isEqualTo(1);
    }

    @Test
    void independentConcurrentImportsReuseOneNamedGroup() throws Exception {
        String pat = realUserPat();
        java.util.List<String> bodies = new java.util.ArrayList<>();
        for (int i = 0; i < 6; i++) bodies.add("{\"requestId\":\"" + java.util.UUID.randomUUID() + "\",\"quizzes\":[{\"title\":\"quiz" + i + "\",\"answerList\":[{\"content\":\"answer\"}],\"groups\":[\"shared\"]}]}");
        parallelImports(java.util.List.of(pat), bodies);
        JsonNode groups = objectMapper.readTree(mockMvc.perform(get("/api/agent/v1/groups")
                .header("Authorization", "Bearer " + pat)).andReturn().getResponse().getContentAsString());
        assertThat(groups).hasSize(1);
        assertThat(groups.get(0).get("quizIds")).hasSize(6);
    }

    @Test
    void existingAmbiguousGroupsRejectImportWithoutChangingData() throws Exception {
        Long userId = newUserId();
        String pat = patForUser(userId);
        com.typingquiz.entity.QuizGroup first = new com.typingquiz.entity.QuizGroup("Shared", "", userId);
        com.typingquiz.entity.QuizGroup second = new com.typingquiz.entity.QuizGroup("shared", "", userId);
        groupRepository.saveAndFlush(first);
        groupRepository.saveAndFlush(second);
        String body = "{\"requestId\":\"" + java.util.UUID.randomUUID() + "\",\"quizzes\":[{\"title\":\"ambiguous\",\"answerList\":[{\"content\":\"answer\"}],\"groups\":[\"SHARED\"]}]}";
        mockMvc.perform(post("/api/agent/v1/imports").header("Authorization", "Bearer " + pat)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnprocessableEntity());
        JsonNode list = objectMapper.readTree(mockMvc.perform(get("/api/agent/v1/quizzes")
                .header("Authorization", "Bearer " + pat)).andReturn().getResponse().getContentAsString());
        assertThat(list.get("total").asInt()).isZero();
        JsonNode groups = objectMapper.readTree(mockMvc.perform(get("/api/agent/v1/groups")
                .header("Authorization", "Bearer " + pat)).andReturn().getResponse().getContentAsString());
        assertThat(groups).hasSize(2);
        for (JsonNode group : groups) assertThat(group.get("quizIds")).isEmpty();
    }

    private java.util.List<String> parallelImports(java.util.List<String> pats, java.util.List<String> bodies) throws Exception {
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(bodies.size());
        java.util.concurrent.CountDownLatch ready = new java.util.concurrent.CountDownLatch(bodies.size());
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        try {
            java.util.List<java.util.concurrent.Future<String>> futures = new java.util.ArrayList<>();
            for (String body : bodies) {
                String pat = pats.get(futures.size() % pats.size());
                futures.add(pool.submit(() -> {
                ready.countDown();
                if (!start.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("start timed out");
                return mockMvc.perform(post("/api/agent/v1/imports").header("Authorization", "Bearer " + pat)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
                }));
            }
            assertThat(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            start.countDown();
            java.util.List<String> results = new java.util.ArrayList<>();
            for (java.util.concurrent.Future<String> future : futures) results.add(future.get(15, java.util.concurrent.TimeUnit.SECONDS));
            return results;
        } finally {
            start.countDown();
            pool.shutdownNow();
            pool.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);
        }
    }

}
