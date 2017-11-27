// ==UserScript==
// @name         保存常用reviewers
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  try to take over the world!
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==
(function() {
    if (typeof window.define == 'undefined' || typeof window.require == 'undefined' || typeof window.stash == 'undefined') {
        return;
    }
    var define = window.define;
    var require = window.require;

    define('joker.li/latest_uesed_reviewers', [
        'aui',
        'jquery',
        'stash/api/util/state'
    ], function(
        AJS,
        jQuery,
        pageState
    ) {
        var listId = "ul_reviewers_list";
        var reviewersDataKey = "reviewers";
        var buttonIconId = "img_group_icon";

        function searchUsersAsync(username) {
            var deferred = jQuery.Deferred();

            var searchParams = { avatarSize: 128, permission: "LICENSED_USER", start: 0, filter: username };

            jQuery.get("/rest/api/latest/users", searchParams)
                .done(function(data) {
                    if (data.values.length > 0) {
                        var rawd = data.values.find(function(value) {
                            return value.emailAddress == username;
                        });
                        if (!rawd) {
                            deferred.resolve(null);
                            return;
                        }
                        var select2Data = {
                            id: rawd.name,
                            text: rawd.displayName || rawd.name,
                            item: rawd
                        };

                        deferred.resolve(select2Data);
                    }

                    deferred.resolve(null);
                })
                .fail(function() {
                    // use resolve instead of reject to avoid prematured end with $.when
                    deferred.resolve(null);
                });

            return deferred.promise();
        }

        function getLocalReviewers() {
            return JSON.parse(localStorage.getItem('_latest_reviewers_')) || [];
        }

        function getLocalGroups() {
            var groups = JSON.parse(localStorage.getItem('_reviewer_groups_')) || [];
            if (groups.length == 0) {
                groups.push({
                    "title": "默认分组"
                });
            }
            return groups;
        }

        function updateLocalGroups(groups) {
            localStorage.setItem("_reviewer_groups_", JSON.stringify(groups));
        }

        function updateLocalReviewers(reviewers) {
            localStorage.setItem("_latest_reviewers_", JSON.stringify(reviewers));
        }

        function convertGroupData() {
            var $groups = jQuery('div.latest-reviewer-groups-container').find('span.latest-reviewer-group');
            var groupData = [];
            for (var i = 0; i < $groups.length; i++) {
                groupData.push(jQuery($groups[i]).prop('reviewers'));
            }
            return groupData;
        }

        function addReviewer(emailAddress) {
            searchUsersAsync(emailAddress).done(function(reviewerData) {
                var all = AJS.$('#reviewers').auiSelect2("data");
                if (all.find(function(i) {
                        return i.item.id == reviewerData.item.id;
                    })) {
                    return;
                }
                all.push(reviewerData);
                var e = new jQuery.Event("change");
                e.from_joker_plugin = true;
                e.added = reviewerData;
                AJS.$('#reviewers').trigger(e);
                AJS.$('#reviewers').auiSelect2("data", all);
            });
        }

        function injectLatestReviewers() {
            var form = jQuery('div.pull-request-create-form');
            jQuery('div.latest-reviewers-container').remove();
            var reviewersContainer = jQuery('<div class="latest-reviewers-container"></div>');
            var reviewerGroupsContainer = jQuery('<div class="latest-reviewer-groups-container"></div>');
            var reviewerUsersContainer = jQuery('<div class="latest-reviewer-users-container"></div>');
            reviewersContainer.append(reviewerGroupsContainer);
            reviewersContainer.append(reviewerUsersContainer);
            form.append(reviewersContainer);

            var groups = getLocalGroups();
            if (groups) {
                groups.forEach(function(group) {
                    var $group = jQuery('<span class="latest-reviewer-group"></span>');
                    var $title = jQuery('<span class="latest-reviewer-group-title">' +
                        group.title +
                        '<span class="latest-reviewer-group-title-delete">ㄨ</span>' +
                        '<span class="latest-reviewer-group-title-edit">ㄍ</span>' +
                        '</span>');
                    var $reviewers = jQuery('<span class="latest-reviewer-group-reviewers"></span>');
                    $group.append($title);
                    $group.append($reviewers);
                    if (group.reviewers) {
                        group.reviewers.forEach(function(reviewer) {
                            var $avatar = jQuery('<img class="latest-reviewer-group-reviewer-avatar"></img>');
                            $avatar.data("reviewer", reviewer.emailAddress);
                            $avatar.prop('src', reviewer.avatar);
                            $reviewers.append($avatar);
                        });
                    }
                    reviewerGroupsContainer.append($group);
                    $group.on('dragover dragleave', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.originalEvent.dataTransfer.dropEffect = 'copy';
                    });
                    $group.prop("reviewers", group);
                    $group.on('click', function(e) {
                        var clickEdit = e.target.className == 'latest-reviewer-group-title-edit';
                        if (clickEdit) {
                            group.title = prompt('请输入新的名字', group.title);
                            updateLocalGroups(convertGroupData());
                            injectLatestReviewers();
                            return;
                        }
                        var deleteGroup = e.target.className == 'latest-reviewer-group-title-delete';
                        if (deleteGroup) {
                            updateLocalGroups(convertGroupData().filter(function(g) {
                                return g != group;
                            }));
                            injectLatestReviewers();
                            return;
                        }
                        if (!group.reviewers) {
                            return;
                        }
                        group.reviewers.forEach(function(r) {
                            addReviewer(r.emailAddress);
                        });
                    });
                });
                $addGroup = jQuery('<span class="latest-reviewer-group-add-new">+</span>');
                $addGroup.prop('title', '添加新分组');
                reviewerGroupsContainer.append($addGroup);
                $addGroup.on('click', function(e) {
                    var currentGroups = convertGroupData();
                    var newGroup = {
                        title: '新分组'
                    };
                    currentGroups.push(newGroup);
                    updateLocalGroups(currentGroups);
                    injectLatestReviewers();
                })
                reviewerGroupsContainer.find(".latest-reviewer-group").on('drop', function(e) {
                    $group = jQuery(e.currentTarget);
                    console.log("drop on", $group, e.originalEvent.dataTransfer);
                    e.preventDefault();
                    e.stopPropagation();
                    var userToAdd = e.originalEvent.dataTransfer.getData("text/email");
                    var iconUrl = e.originalEvent.dataTransfer.getData("text/uri");
                    var user = {
                        emailAddress: userToAdd,
                        avatar: iconUrl
                    };
                    var group = $group.prop("reviewers");
                    if (!group.reviewers) {
                        group.reviewers = [user];
                    } else {
                        if (group.reviewers.find(function(r) {
                                return r.emailAddress == userToAdd;
                            })) {
                            return;
                        } else {
                            group.reviewers.push(user);
                        }
                    }
                    console.log("droped user", userToAdd);
                    var $user = jQuery('<img class="latest-reviewer-group-reviewer-avatar" src="' + iconUrl + '"></img>');
                    $user.data('emailAddress', userToAdd);
                    $user.prop('title', userToAdd);
                    $group.find(".latest-reviewer-group-reviewers").append($user);
                    updateLocalGroups(convertGroupData());
                    injectLatestReviewers();
                });
            }


            var reviewers = getLocalReviewers();
            if (reviewers) {
                reviewers.forEach(function(reviewer) {
                    var $img = jQuery('<img src="' + reviewer.avatar + '"></img>');
                    var $name = jQuery('<span></span>').text(reviewer.name);
                    var $container = jQuery('<div class="latest-reviewers-item" title="' + reviewer.emailAddress + '"></div>');
                    $img.data("reviewer", reviewer.emailAddress);
                    $container.append($img);
                    $container.append($name);
                    reviewerUsersContainer.append($container);
                });
                reviewerUsersContainer.find('div.latest-reviewers-item').find('img').each(function() {
                    var avatar = jQuery(this);
                    var reviewer = avatar.data('reviewer');
                    avatar.on('dragstart', function(e) {
                        e.originalEvent.dataTransfer.effectAllowed = 'copy';
                        e.originalEvent.dataTransfer.setData("text/email", reviewer);
                        e.originalEvent.dataTransfer.setData("text/uri", e.currentTarget.src);
                        console.log("dragstart", e.originalEvent.dataTransfer);
                    });
                    avatar.on('dragend', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                    })
                });
                reviewerUsersContainer.find('div.latest-reviewers-item').find('img').click(function() {
                    var reviewer = jQuery(this).data("reviewer");
                    addReviewer(reviewer);
                });
            }

            AJS.$('#reviewers').on('change', function(event) {
                console.log('changing reviewers', JSON.stringify(event, 0, 2));
                if (event.from_joker_plugin || !event.added) {
                    return;
                }
                var added = event.added.item;
                var localReviewers = getLocalReviewers();
                if (!localReviewers.find((function(reviewer) {
                        return reviewer.emailAddress == added.emailAddress;
                    }))) {
                    localReviewers.push({
                        emailAddress: added.emailAddress,
                        avatar: added.avatarUrl,
                        name: added.displayName
                    });
                    updateLocalReviewers(localReviewers);
                    injectLatestReviewers();
                } else {
                    console.log('ignore existing user', added);
                }
            });
        }

        function injectInlineStyle() {
            jQuery('head').append(jQuery('<style type="text/css">' +
                '.latest-reviewer-users-container,' +
                '.latest-reviewer-groups-container { ' +
                'display: flex; ' +
                'flex-wrap: wrap;' +
                '}' +
                'span.latest-reviewer-group {' +
                '   border: dashed 0.5px;' +
                '   padding: 4px;' +
                '   cursor: pointer;' +
                '   max-width: 224px;' +
                '   user-select: none;' +
                '   margin: 4px 8px;' +
                '}' +
                '.latest-reviewer-group-title {' +
                '    display: block;' +
                '    width: 100%;' +
                '    padding-right: 20px;' +
                '}' +
                'span.latest-reviewer-group-reviewers {' +
                '   display: flex;' +
                '   flex-wrap: wrap;' +
                '}' +
                '.latest-reviewer-group-title-edit, .latest-reviewer-group-title-delete {' +
                '    float: right;' +
                '}' +
                'span.latest-reviewer-group-add-new {' +
                '    font-weight: 900;' +
                '    font-size: 249%;' +
                '    padding: 0px 10px;' +
                '    margin: 2px;' +
                '    color: goldenrod;' +
                '    cursor: pointer;' +
                '}' +
                '.latest-reviewer-group-reviewer-avatar {' +
                '   width: 24px;' +
                '   height: 24px;' +
                '   margin: 2px;' +
                '   border: dashed 1px gold;' +
                '   background-color: gold;' +
                '   box-sizing: border-box;' +
                '}' +
                'div.latest-reviewers-item > img {' +
                '    width: 48px;' +
                '    display: block;' +
                '    margin: 0 auto;' +
                '    cursor: pointer;' +
                '}' +
                'div.latest-reviewers-item > span {' +
                '    display: block;' +
                '    text-align: center;' +
                '    word-break: break-all;' +
                '    padding: 0px 4px;' +
                '    font-size: 90%;' +
                '}' +
                'div.latest-reviewers-item {' +
                '    width: 48px;' +
                '    padding: 8px;' +
                '    text-align: center;' +
                '}' +
                '</style>'));
        }
        return {
            init: function() {
                injectInlineStyle();
                injectLatestReviewers();
            }
        };
    });

    require(['joker.li/latest_uesed_reviewers'], function(plugin) {
        plugin.init();
    });
})();